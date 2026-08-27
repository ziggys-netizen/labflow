import { doc, writeBatch, type DocumentData, type UpdateData } from "firebase/firestore";
import { db } from "./firebase";
import { getClinicDocs } from "./clinicScope";
import { trackedBatchCommit } from "./trackedWrites";
import { actorFromAuth, auditTargetLabel, safeLogAudit } from "./audit";

const BATCH_LIMIT = 450;

export function isPatientDeleted(data: { deleted?: unknown } | null | undefined): boolean {
  return data?.deleted === true;
}

export function isOrderForDeletedPatient(
  data: { patientDeleted?: unknown } | null | undefined
): boolean {
  return data?.patientDeleted === true;
}

export interface SoftDeleteActor {
  uid: string;
  email: string | null;
  role: string | null;
  shift?: string | null;
}

function actorEmail(actor: SoftDeleteActor) {
  return actor.email || actor.uid;
}

async function ordersForPatient(
  patientId: string,
  role: string | null,
  clinicId: string | null
) {
  const docs = await getClinicDocs("orders", role, clinicId);
  return docs.filter((d) => d.data().patientId === patientId);
}

async function commitUpdates(
  updates: { id: string; collection: "patients" | "orders"; data: UpdateData<DocumentData> }[],
  meta: { actorUid: string; actorLabel: string; summary: string; patientName?: string }
) {
  for (let i = 0; i < updates.length; i += BATCH_LIMIT) {
    const chunk = updates.slice(i, i + BATCH_LIMIT);
    const batch = writeBatch(db);
    for (const item of chunk) {
      batch.update(doc(db, item.collection, item.id), item.data);
    }
    await trackedBatchCommit(
      batch,
      chunk.map((item) => ({
        operation: "update" as const,
        collection: item.collection,
        documentId: item.id,
        actorUid: meta.actorUid,
        actorLabel: meta.actorLabel,
        patientName: meta.patientName,
        orderId: item.collection === "orders" ? item.id : null,
        summary:
          item.collection === "patients"
            ? meta.summary
            : `${meta.summary} (order ${item.id})`,
        expected: item.data as Record<string, unknown>,
      }))
    );
  }
}

/** Soft-delete a patient and flag their orders. Never deletes documents. */
export async function softDeletePatient(params: {
  patientId: string;
  reason: string;
  actor: SoftDeleteActor;
  role: string | null;
  clinicId: string | null;
  targetLabel?: string;
  reasonCode?: string;
  patientClinicId?: string | null;
}): Promise<void> {
  const deletionReason = params.reason.trim();
  if (!deletionReason) {
    throw new Error("A reason is required.");
  }

  const now = new Date().toISOString();
  const orders = await ordersForPatient(params.patientId, params.role, params.clinicId);

  await commitUpdates(
    [
      {
        collection: "patients",
        id: params.patientId,
        data: {
          deleted: true,
          deletedAt: now,
          deletedBy: actorEmail(params.actor),
          deletedByUid: params.actor.uid,
          deletedByRole: params.actor.role || "",
          deletionReason,
        },
      },
      ...orders.map((orderDoc) => ({
        collection: "orders" as const,
        id: orderDoc.id,
        data: { patientDeleted: true },
      })),
    ],
    {
      actorUid: params.actor.uid,
      actorLabel: actorEmail(params.actor),
      summary: "Removed patient record",
    }
  );

  const auditActor = actorFromAuth(params.actor, params.actor.role, params.actor.shift ?? null);
  if (auditActor) {
    safeLogAudit({
      clinicId: params.patientClinicId || params.clinicId,
      actor: auditActor,
      action: "patient.softDelete",
      targetCollection: "patients",
      targetId: params.patientId,
      targetLabel: params.targetLabel || auditTargetLabel(null, "patient"),
      detail: {
        reasonCode: params.reasonCode || "",
        fields: ["deleted", "deletedAt", "deletedBy", "deletedByUid", "deletedByRole", "deletionReason"],
      },
    });
  }
}

/** Restore a soft-deleted patient and return their orders to active queues. */
export async function restorePatient(params: {
  patientId: string;
  actor: SoftDeleteActor;
  role: string | null;
  clinicId: string | null;
  targetLabel?: string;
  patientClinicId?: string | null;
}): Promise<void> {
  const now = new Date().toISOString();
  const orders = await ordersForPatient(params.patientId, params.role, params.clinicId);
  const restoredBy = actorEmail(params.actor);

  await commitUpdates(
    [
      {
        collection: "patients",
        id: params.patientId,
        data: {
          deleted: false,
          deletedAt: null,
          deletedBy: null,
          deletedByUid: null,
          deletedByRole: null,
          deletionReason: null,
          restoredBy,
          restoredAt: now,
        },
      },
      ...orders.map((orderDoc) => ({
        collection: "orders" as const,
        id: orderDoc.id,
        data: {
          patientDeleted: false,
          restoredBy,
          restoredAt: now,
        },
      })),
    ],
    {
      actorUid: params.actor.uid,
      actorLabel: restoredBy,
      summary: "Restored patient record",
    }
  );

  const auditActor = actorFromAuth(params.actor, params.actor.role, params.actor.shift ?? null);
  if (auditActor) {
    safeLogAudit({
      clinicId: params.patientClinicId || params.clinicId,
      actor: auditActor,
      action: "patient.restore",
      targetCollection: "patients",
      targetId: params.patientId,
      targetLabel: params.targetLabel || params.patientId,
      detail: { fields: ["deleted", "restoredBy", "restoredAt"] },
    });
  }
}
