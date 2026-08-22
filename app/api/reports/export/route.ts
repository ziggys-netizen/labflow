import type { Query, QueryDocumentSnapshot } from "firebase-admin/firestore";
import { getAdminDb, isAdminCredentialError } from "@/app/lib/firebaseAdmin";
import {
  asRecord,
  jsonError,
  json503,
  readJsonBody,
  requireCapability,
} from "@/app/lib/apiAuth";
import { logAudit } from "@/app/lib/auditAdmin";
import { canExportData } from "@/app/lib/permissions";
import {
  MAX_EXPORT_RANGE_DAYS,
  MAX_EXPORT_ROWS,
  MAX_EXPORTS_PER_HOUR,
  RANGE_CAP_MESSAGE,
  EXPORT_DENIED_MESSAGE,
  REPORT_TYPE_LABELS,
  clinicScopeForExport,
  exportFilename,
  parseExportRequest,
  parseRecentExports,
  type RecentExport,
  type ReportType,
} from "@/app/lib/reportExport";
import { buildReportWorkbook } from "@/app/lib/reportWorkbook";
import { getResend, resendFromAddress, ResendUnavailableError } from "@/app/lib/resendMail";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PAGE_SIZE = 400;

function dateFieldFor(reportType: ReportType): { collection: string; field: string } {
  switch (reportType) {
    case "patients":
      return { collection: "patients", field: "createdAt" };
    case "orders":
      return { collection: "orders", field: "createdAt" };
    case "results":
      return { collection: "orders", field: "resultsEnteredAt" };
    case "inventory":
      return { collection: "inventoryMovements", field: "occurredAt" };
  }
}

async function fetchInRange(options: {
  collection: string;
  field: string;
  clinicId: string | null;
  startIso: string;
  endExclusiveIso: string;
}): Promise<{ docs: QueryDocumentSnapshot[]; capped: boolean }> {
  const db = getAdminDb();
  const out: QueryDocumentSnapshot[] = [];
  let cursor: QueryDocumentSnapshot | undefined;
  while (out.length <= MAX_EXPORT_ROWS) {
    let q: Query = db.collection(options.collection);
    if (options.clinicId) q = q.where("clinicId", "==", options.clinicId);
    q = q
      .where(options.field, ">=", options.startIso)
      .where(options.field, "<", options.endExclusiveIso)
      .orderBy(options.field, "desc")
      .limit(PAGE_SIZE);
    if (cursor) q = q.startAfter(cursor);
    const snap = await q.get();
    if (snap.empty) break;
    out.push(...snap.docs);
    cursor = snap.docs[snap.docs.length - 1];
    if (snap.size < PAGE_SIZE) break;
  }
  return { docs: out.slice(0, MAX_EXPORT_ROWS + 1), capped: out.length > MAX_EXPORT_ROWS };
}

async function consumeExportQuota(uid: string): Promise<boolean> {
  const hour = new Date().toISOString().slice(0, 13);
  const ref = getAdminDb().collection("serverExportRateLimits").doc(uid);
  return getAdminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.data();
    const count = data?.hour === hour ? Number(data.count) || 0 : 0;
    if (count >= MAX_EXPORTS_PER_HOUR) return true;
    tx.set(
      ref,
      {
        hour,
        count: count + 1,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
    return false;
  });
}

async function appendRecentExport(uid: string, entry: RecentExport) {
  const ref = getAdminDb().collection("serverExportRateLimits").doc(uid);
  const snap = await ref.get();
  const recent = [entry, ...parseRecentExports(snap.data()?.recent)].slice(0, 10);
  await ref.set({ recent, lastExportAt: entry.at }, { merge: true });
}

function jsonResend503() {
  return jsonError(
    503,
    "Email delivery is not configured. Set RESEND_API_KEY and RESEND_FROM (verified sending domain in Resend)."
  );
}

export async function GET(request: Request) {
  const auth = await requireCapability(request, canExportData, EXPORT_DENIED_MESSAGE);
  if (auth instanceof Response) return auth;

  try {
    const snap = await getAdminDb().collection("serverExportRateLimits").doc(auth.token.uid).get();
    return Response.json({
      ok: true,
      recipient: auth.email,
      recent: parseRecentExports(snap.data()?.recent),
      maxRangeDays: MAX_EXPORT_RANGE_DAYS,
      maxPerHour: MAX_EXPORTS_PER_HOUR,
      rangeCapReason: RANGE_CAP_MESSAGE,
    });
  } catch (err) {
    if (isAdminCredentialError(err)) return json503();
    console.error(err);
    return jsonError(500, "Something went wrong. Please try again.");
  }
}

export async function POST(request: Request) {
  const auth = await requireCapability(request, canExportData, EXPORT_DENIED_MESSAGE);
  if (auth instanceof Response) return auth;

  try {
    const parsed = parseExportRequest(asRecord(await readJsonBody(request)));
    if ("error" in parsed) return jsonError(400, parsed.error);

    const scope = clinicScopeForExport(auth.role, auth.clinicId);
    if ("error" in scope) return jsonError(403, scope.error);

    const recipient = auth.email;
    if (parsed.delivery === "email" && !recipient) {
      return jsonError(400, "No registered email on this account.");
    }

    if (await consumeExportQuota(auth.token.uid)) {
      return jsonError(
        429,
        `Too many exports. Limit is ${MAX_EXPORTS_PER_HOUR} per hour for this account.`
      );
    }

    const target = dateFieldFor(parsed.reportType);
    const fetched = await fetchInRange({
      collection: target.collection,
      field: target.field,
      clinicId: scope.clinicId,
      startIso: parsed.startIso,
      endExclusiveIso: parsed.endExclusiveIso,
    });
    if (fetched.capped) {
      return jsonError(
        400,
        `This export would include more than ${MAX_EXPORT_ROWS} rows. Narrow the date range.`
      );
    }

    const docs = fetched.docs.map((doc) => ({
      id: doc.id,
      data: doc.data() as Record<string, unknown>,
    }));
    const workbook = buildReportWorkbook(parsed.reportType, docs);
    const filename = exportFilename(parsed.reportType, parsed.startDate, parsed.endDate);
    const label = REPORT_TYPE_LABELS[parsed.reportType];

    if (parsed.delivery === "email") {
      const resend = getResend();
      const from = resendFromAddress();
      const sent = await resend.emails.send({
        from,
        to: recipient as string,
        subject: `LabFlow ${label} export ${parsed.startDate} to ${parsed.endDate}`,
        text: [
          `A ${label.toLowerCase()} spreadsheet for ${parsed.startDate} to ${parsed.endDate} is attached.`,
          `${workbook.rowCount} row${workbook.rowCount === 1 ? "" : "s"}.`,
          scope.allClinics ? "Scope: all clinics (owner)." : "Scope: your clinic.",
          "This message was sent only to the address on your LabFlow account.",
        ].join("\n"),
        attachments: [
          {
            filename,
            content: workbook.buffer,
            contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          },
        ],
      });
      if (sent.error) {
        console.error(sent.error);
        return jsonError(502, "The spreadsheet was built but email delivery failed. Try again shortly.");
      }
    }

    const at = new Date().toISOString();
    const recent: RecentExport = {
      at,
      reportType: parsed.reportType,
      startDate: parsed.startDate,
      endDate: parsed.endDate,
      rowCount: workbook.rowCount,
      recipient: recipient || (parsed.delivery === "download" ? "download" : ""),
    };
    await logAudit({
      clinicId: scope.clinicId,
      actor: {
        uid: auth.token.uid,
        email: recipient,
        role: auth.role,
        shift: auth.identity.shift,
        actingAsOwner: auth.role === "owner",
      },
      action: "report.exported",
      targetCollection: target.collection,
      targetId: parsed.reportType,
      targetLabel: `${label} ${parsed.startDate} to ${parsed.endDate}`,
      detail: {
        reportType: parsed.reportType,
        startDate: parsed.startDate,
        endDate: parsed.endDate,
        rowCount: workbook.rowCount,
        recipient: recipient || null,
        delivery: parsed.delivery,
        allClinics: scope.allClinics,
      },
    });
    await appendRecentExport(auth.token.uid, recent);

    if (parsed.delivery === "download") {
      return new Response(new Uint8Array(workbook.buffer), {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "X-Export-Row-Count": String(workbook.rowCount),
        },
      });
    }

    return Response.json({
      ok: true,
      recipient,
      rowCount: workbook.rowCount,
      reportType: parsed.reportType,
      startDate: parsed.startDate,
      endDate: parsed.endDate,
      delivery: parsed.delivery,
    });
  } catch (err) {
    if (err instanceof ResendUnavailableError) return jsonResend503();
    if (isAdminCredentialError(err)) return json503();
    console.error(err);
    return jsonError(500, "Something went wrong. Please try again.");
  }
}
