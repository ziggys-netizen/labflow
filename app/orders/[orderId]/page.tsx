"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "../../lib/AuthContext";
import { db } from "../../lib/firebase";
import { doc, getDocs } from "firebase/firestore";
import { LabTest, SPECIMEN_TYPE_LABELS, resolveSpecimenType, type SpecimenType } from "../../lib/testCatalog";
import { isTestReviewed, UNREVIEWED_RANGE_CAVEAT } from "../../lib/catalogSeed";
import ProtectedRoute from "../../lib/ProtectedRoute";
import AppNav from "../../lib/AppNav";
import NotYetSynced from "../../lib/NotYetSynced";
import { clinicCollectionQuery, isOwner, ownerActingReviewFields } from "../../lib/clinicScope";
import { subscribeDocument } from "../../lib/clinicListen";
import { useConnection } from "../../lib/ConnectionContext";
import { trackedSetDoc, writeActorFromUser } from "../../lib/trackedWrites";
import { canApproveResults, canEnterResults, canRecordSampleCollection, canSendBackForCorrection } from "../../lib/permissions";
import { actorFromAuth, logAudit } from "../../lib/audit";
import ResultFlagMark from "../../lib/ResultFlagMark";
import {
  OFFLINE_RELEASE_MESSAGE,
  SELF_RELEASE_MESSAGE,
  SEND_BACK_REASON_MESSAGE,
  isSelfRelease,
  reviewNotesReady,
} from "../../lib/reviewQueue";
import {
  AMENDMENT_REASON_MIN_LENGTH,
  SECOND_APPROVER_WAITING_MESSAGE,
  SELF_AMEND_MESSAGE,
  actorIsOriginalReleaser,
  actorIsPendingInitiator,
  amendmentAuditDetail,
  cancelPendingAmendmentUpdates,
  cloneResultValues,
  confirmAmendment,
  ensureResultVersions,
  firstReleaseVersion,
  isReleasedResultStatus,
  parsePendingAmendment,
  startAmendment,
  type AmendmentActor,
  type ResultValues,
} from "../../lib/resultAmendment";
import {
  interpretCollection,
  mergeSpecimenCollections,
  parseSampleCollectedSource,
  SAMPLE_COLLECTED_SOURCE,
  specimenCollectionWrite,
  type SampleCollectedSource,
  type SampleCollections,
} from "../../lib/sampleCollection";
import { toDateTimeLocal, fromDateTimeLocal } from "../../lib/datetime";
import { resultFlag } from "../../lib/resultFlag";

interface OrderTest {
  code: string;
  name: string;
  specimenType?: string | null;
}

interface OrderData {
  patientId: string;
  patientName: string;
  patientLabId: string;
  tests: OrderTest[];
  status: string;
  createdAt: string;
  clinicId?: string;
  sampleCollectedAt?: string | null;
  sampleCollectedBy?: string | null;
  sampleCollectedSource?: SampleCollectedSource | null;
  sampleCollections?: SampleCollections | null;
  legacySingleCollection?: boolean;
  results?: Record<string, Record<string, string>>;
  resultsEnteredBy?: string | null;
  resultsEnteredAt?: string;
  reviewedBy?: string | null;
  reviewedAt?: string;
  reviewNotes?: string;
  reviewedByUid?: string | null;
  reviewedByRole?: string | null;
  reviewedByShift?: string | null;
  actingAsOwner?: boolean;
  resultVersions?: unknown;
  pendingAmendment?: unknown;
  pendingAmendmentAt?: string | null;
  currentResultVersion?: number;
  lastAmendedAt?: string;
  lastAmendedBy?: string | null;
  lastAmendedByRole?: string | null;
  lastAmendedByShift?: string | null;
  patientDeleted?: boolean;
  notYetSynced?: boolean;
}

function OrderDetailContent() {
  const params = useParams();
  const { user, role, clinicId, shift, username } = useAuth();
  const { isOnline } = useConnection();
  const orderId = params.orderId as string;

  const [order, setOrder] = useState<OrderData | null>(null);
  const [catalog, setCatalog] = useState<LabTest[]>([]);
  const [loadedOrderId, setLoadedOrderId] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, Record<string, string>>>({});
  const [reviewNotes, setReviewNotes] = useState("");
  const [amendDraft, setAmendDraft] = useState<ResultValues>({});
  const [amendReason, setAmendReason] = useState("");
  const [amendOpen, setAmendOpen] = useState(false);
  const [status, setStatus] = useState("");
  const [expandedTest, setExpandedTest] = useState<string | null>(null);
  const [collectionTimes, setCollectionTimes] = useState<Partial<Record<SpecimenType, string>>>({});
  const [editingType, setEditingType] = useState<SpecimenType | null>(null);
  const [patientRecord, setPatientRecord] = useState<{ id: string; sex: string | null } | null>(null);
  const resultsDirty = useRef(false);
  const amendDirty = useRef(false);
  const loading = loadedOrderId !== orderId;

  useEffect(() => {
    resultsDirty.current = false;
    amendDirty.current = false;
    const unsub = subscribeDocument(
      "orders",
      orderId,
      (snap) => {
        if (!snap.exists()) {
          setOrder(null);
          setLoadedOrderId(orderId);
          return;
        }
        const data = snap.data() as OrderData;
        if (!isOwner(role) && clinicId && data.clinicId && data.clinicId !== clinicId) {
          setOrder(null);
        } else {
          setOrder({
            ...data,
            sampleCollectedSource: parseSampleCollectedSource(data.sampleCollectedSource),
            notYetSynced: snap.metadata.hasPendingWrites,
          });
          if (!resultsDirty.current) setResults(data.results || {});
          if (!amendDirty.current) setAmendDraft(cloneResultValues(data.results));
        }
        setLoadedOrderId(orderId);
      },
      (err) => {
        console.error(err);
        setLoadedOrderId(orderId);
      }
    );
    return unsub;
  }, [orderId, role, clinicId]);

  useEffect(() => {
    if (!order?.patientId) return;
    const patientId = order.patientId;
    return subscribeDocument(
      "patients",
      patientId,
      (snap) => {
        const sex = snap.exists() ? snap.data()?.sex : null;
        setPatientRecord({ id: patientId, sex: typeof sex === "string" ? sex : null });
      },
      (err) => {
        console.error(err);
      }
    );
  }, [order?.patientId]);

  useEffect(() => {
    async function loadCatalog() {
      try {
        const catalogSnap = await getDocs(clinicCollectionQuery("testCatalog", role, clinicId));
        const rows = catalogSnap.docs.map((d) => d.data() as LabTest);
        const orderClinic = order?.clinicId || clinicId;
        setCatalog(orderClinic ? rows.filter((t) => !t.clinicId || t.clinicId === orderClinic) : rows);
      } catch (err) {
        console.error(err);
      }
    }
    loadCatalog();
  }, [role, clinicId, order?.clinicId]);

  function getTestDefinition(code: string): LabTest | undefined {
    return catalog.find((t) => t.code === code);
  }

  const resultsEditable = order && (order.status === "pending" || order.status === "results_entered" || order.status === "needs_correction");

  function updateResultValue(testCode: string, paramName: string, value: string) {
    if (!resultsEditable || !canEnterResults(role)) return;
    resultsDirty.current = true;
    setResults((prev) => ({
      ...prev,
      [testCode]: {
        ...(prev[testCode] || {}),
        [paramName]: value,
      },
    }));
  }

  function orderWriteMeta(summary: string, expected: Record<string, unknown>) {
    return {
      ...writeActorFromUser(user, username),
      operation: "update" as const,
      summary,
      clinicId: order?.clinicId || clinicId,
      patientName: order?.patientName,
      patientLabId: order?.patientLabId,
      orderId,
      expected,
    };
  }

  async function recordSampleCollection(type: SpecimenType, iso: string | null) {
    if (!user || !iso || !canRecordSampleCollection(role)) return;
    setStatus(`Recording ${SPECIMEN_TYPE_LABELS[type].toLowerCase()} collection...`);
    const sampleCollections = mergeSpecimenCollections(order?.sampleCollections, {
      [type]: specimenCollectionWrite(iso, user.email, SAMPLE_COLLECTED_SOURCE.order),
    });
    const updates = {
      sampleCollections,
      sampleCollectedSource: SAMPLE_COLLECTED_SOURCE.order,
      clinicId: order?.clinicId || clinicId || undefined,
    };
    await trackedSetDoc(
      doc(db, "orders", orderId),
      { ...updates, sampleCollectionQuickAction: null },
      { merge: true },
      orderWriteMeta(
        `Recorded ${SPECIMEN_TYPE_LABELS[type].toLowerCase()} collection for ${order?.patientName ?? "order"}`,
        { sampleCollections: { [type]: { collectedAt: iso } } }
      )
    );
    await auditOrder("order.sampleCollected", { specimenType: type, source: SAMPLE_COLLECTED_SOURCE.order });
    setOrder((prev) => (prev ? { ...prev, ...updates, notYetSynced: true } : prev));
    setEditingType(null);
    setStatus(`${SPECIMEN_TYPE_LABELS[type]} collection recorded.`);
    setTimeout(() => setStatus(""), 2500);
  }

  async function submitForReview() {
    if (!user || !canEnterResults(role)) return;
    setStatus("Submitting results for review...");
    const updates = {
      results,
      status: "results_entered",
      resultsEnteredBy: user.email,
      resultsEnteredAt: new Date().toISOString(),
      clinicId: order?.clinicId || clinicId || undefined,
    };
    await trackedSetDoc(
      doc(db, "orders", orderId),
      updates,
      { merge: true },
      orderWriteMeta(`Entered results for ${order?.patientName ?? "order"}`, {
        status: "results_entered",
      })
    );
    resultsDirty.current = false;
    setOrder((prev) => (prev ? { ...prev, ...updates, notYetSynced: true } : prev));
    await auditOrder("order.resultsEntered", { status: "results_entered" });
    setStatus("Results submitted for review.");
    setTimeout(() => setStatus(""), 2500);
  }

  async function auditOrder(
    action: "order.approved" | "order.sentBack" | "order.amended" | "order.sampleCollected" | "order.resultsEntered",
    detail?: Record<string, unknown>
  ) {
    const actor = actorFromAuth(user, role, shift);
    if (!actor) return;
    try {
      await logAudit({
        clinicId: order?.clinicId || clinicId || null,
        actor,
        action,
        targetCollection: "orders",
        targetId: orderId,
        targetLabel: [order?.patientName, order?.patientLabId].filter(Boolean).join(" — ") || orderId,
        detail,
      });
    } catch (err) {
      console.error(err);
    }
  }

  function amendmentActor(): AmendmentActor | null {
    if (!user) return null;
    return { uid: user.uid, email: user.email, role, shift };
  }

  async function approveAndRelease() {
    if (!user || !canApproveResults(role)) return;
    if (!isOnline) {
      setStatus(OFFLINE_RELEASE_MESSAGE);
      return;
    }
    if (isSelfRelease(order?.resultsEnteredBy, user.email)) {
      setStatus(SELF_RELEASE_MESSAGE);
      return;
    }
    setStatus("Approving...");
    const releasedAt = new Date().toISOString();
    const releasedValues = cloneResultValues(order?.results || results);
    const v1 = firstReleaseVersion({
      values: releasedValues,
      releasedBy: user.email,
      releasedByUid: user.uid,
      releasedAt,
    });
    const updates = {
      status: "approved",
      reviewedBy: user.email,
      reviewedAt: releasedAt,
      reviewNotes: "",
      reviewedByUid: user.uid,
      reviewedByRole: role,
      reviewedByShift: shift ?? null,
      resultVersions: [v1],
      currentResultVersion: 1,
      pendingAmendment: null,
      pendingAmendmentAt: null,
      ...ownerActingReviewFields(role),
    };
    await trackedSetDoc(
      doc(db, "orders", orderId),
      updates,
      { merge: true },
      orderWriteMeta(`Released results for ${order?.patientName ?? "order"}`, {
        status: "approved",
      })
    );
    setOrder((prev) => (prev ? { ...prev, ...updates, notYetSynced: true } : prev));
    await auditOrder("order.approved", { status: "approved" });
    setStatus("Results approved and released.");
    setTimeout(() => setStatus(""), 2500);
  }

  async function sendBackForCorrection() {
    if (!user || !canSendBackForCorrection(role)) return;
    if (!isOnline) {
      setStatus(OFFLINE_RELEASE_MESSAGE);
      return;
    }
    const notes = reviewNotes.trim();
    if (!reviewNotesReady(notes)) {
      setStatus(SEND_BACK_REASON_MESSAGE);
      return;
    }
    setStatus("Sending back...");
    const updates = {
      status: "needs_correction",
      reviewedBy: user.email,
      reviewedAt: new Date().toISOString(),
      reviewNotes: notes,
      reviewedByUid: user.uid,
      reviewedByRole: role,
      reviewedByShift: shift ?? null,
      ...ownerActingReviewFields(role),
    };
    await trackedSetDoc(
      doc(db, "orders", orderId),
      updates,
      { merge: true },
      orderWriteMeta(`Sent results back for ${order?.patientName ?? "order"}`, {
        status: "needs_correction",
      })
    );
    setOrder((prev) => (prev ? { ...prev, ...updates, notYetSynced: true } : prev));
    await auditOrder("order.sentBack", { status: "needs_correction", reviewNotes: notes });
    setReviewNotes("");
    setStatus("Sent back for correction.");
    setTimeout(() => setStatus(""), 2500);
  }

  function updateAmendValue(testCode: string, paramName: string, value: string) {
    amendDirty.current = true;
    setAmendDraft((prev) => ({
      ...prev,
      [testCode]: {
        ...(prev[testCode] || {}),
        [paramName]: value,
      },
    }));
  }

  async function submitAmendment() {
    if (!user || !canApproveResults(role) || !order) return;
    if (!isOnline) {
      setStatus(OFFLINE_RELEASE_MESSAGE);
      return;
    }
    const actor = amendmentActor();
    if (!actor) return;
    const result = startAmendment({
      order: {
        status: order.status,
        results: order.results,
        resultVersions: order.resultVersions,
        pendingAmendment: order.pendingAmendment,
        reviewedBy: order.reviewedBy,
        reviewedByUid: order.reviewedByUid,
        reviewedAt: order.reviewedAt,
      },
      newValues: amendDraft,
      reason: amendReason,
      actor,
    });
    if (!result.ok) {
      setStatus(result.error);
      return;
    }
    setStatus(result.mode === "pending" ? "Submitting amendment for confirmation..." : "Amending...");
    await trackedSetDoc(
      doc(db, "orders", orderId),
      result.updates,
      { merge: true },
      orderWriteMeta(
        result.mode === "pending"
          ? `Requested amendment for ${order.patientName}`
          : `Amended results for ${order.patientName}`,
        result.mode === "applied"
          ? { status: "amended" }
          : { pendingAmendmentAt: result.updates.pendingAmendmentAt }
      )
    );
    setOrder((prev) => (prev ? { ...prev, ...result.updates, notYetSynced: true } : prev));
    amendDirty.current = false;
    setAmendOpen(false);
    setAmendReason("");
    if (result.mode === "applied") {
      setResults(result.updates.results as ResultValues);
      await auditOrder(
        "order.amended",
        amendmentAuditDetail({
          reason: amendReason,
          previousVersion: result.previousVersion,
          newVersion: result.newVersion,
          amender: actor,
          confirmer: null,
          secondApprover: false,
        })
      );
      setStatus("Result amended.");
    } else {
      setStatus(SECOND_APPROVER_WAITING_MESSAGE);
    }
    setTimeout(() => setStatus(""), 4000);
  }

  async function confirmPendingAmendment() {
    if (!user || !canApproveResults(role) || !order) return;
    if (!isOnline) {
      setStatus(OFFLINE_RELEASE_MESSAGE);
      return;
    }
    const actor = amendmentActor();
    if (!actor) return;
    const result = confirmAmendment({
      order: {
        status: order.status,
        results: order.results,
        resultVersions: order.resultVersions,
        pendingAmendment: order.pendingAmendment,
        reviewedBy: order.reviewedBy,
        reviewedByUid: order.reviewedByUid,
        reviewedAt: order.reviewedAt,
      },
      confirmer: actor,
    });
    if (!result.ok) {
      setStatus(result.error);
      return;
    }
    setStatus("Confirming amendment...");
    await trackedSetDoc(
      doc(db, "orders", orderId),
      result.updates,
      { merge: true },
      orderWriteMeta(`Confirmed amendment for ${order.patientName}`, { status: "amended" })
    );
    setOrder((prev) => (prev ? { ...prev, ...result.updates, notYetSynced: true } : prev));
    setResults(result.updates.results as ResultValues);
    const pending = parsePendingAmendment(order.pendingAmendment);
    await auditOrder(
      "order.amended",
      amendmentAuditDetail({
        reason: pending?.amendmentReason || "",
        previousVersion: result.previousVersion,
        newVersion: result.newVersion,
        amender: result.amender,
        confirmer: actor,
        secondApprover: true,
      })
    );
    setStatus("Amendment confirmed.");
    setTimeout(() => setStatus(""), 2500);
  }

  async function cancelPendingAmendment() {
    if (!user || !canApproveResults(role) || !order) return;
    if (!isOnline) {
      setStatus(OFFLINE_RELEASE_MESSAGE);
      return;
    }
    const updates = cancelPendingAmendmentUpdates();
    await trackedSetDoc(
      doc(db, "orders", orderId),
      updates,
      { merge: true },
      orderWriteMeta(`Cancelled pending amendment for ${order.patientName}`, { pendingAmendmentAt: null })
    );
    setOrder((prev) => (prev ? { ...prev, ...updates, notYetSynced: true } : prev));
    setStatus("Pending amendment cancelled.");
    setTimeout(() => setStatus(""), 2500);
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-white">
        <AppNav />
        <div className="min-h-[50vh] flex items-center justify-center text-gray-600">Loading order...</div>
      </main>
    );
  }
  if (!order) {
    return (
      <main className="min-h-screen bg-white">
        <AppNav />
        <div className="min-h-[50vh] flex items-center justify-center text-gray-600">Order not found.</div>
      </main>
    );
  }

  const canReview = canApproveResults(role);
  const canCorrect = canSendBackForCorrection(role);
  const canCollect = canRecordSampleCollection(role);
  const canEnter = canEnterResults(role);
  const ownResults = isSelfRelease(order.resultsEnteredBy, user?.email);
  const patientSex = patientRecord?.id === order.patientId ? patientRecord.sex : null;
  const collection = interpretCollection(order, catalog);
  const awaitingSample = !collection.allCollected;
  const statusLabel =
    collection.awaitingLabel || (order.status === "amended" ? "Amended" : order.status.replace("_", " "));
  const released = isReleasedResultStatus(order.status);
  const pendingAmendment = parsePendingAmendment(order.pendingAmendment);
  const versions = ensureResultVersions(order);
  const originalReleaser = actorIsOriginalReleaser(order, { uid: user?.uid, email: user?.email });
  const pendingInitiator = actorIsPendingInitiator(pendingAmendment, {
    uid: user?.uid,
    email: user?.email,
  });

  return (
    <main className="min-h-screen bg-white">
      <AppNav />
      <div className="max-w-2xl mx-auto px-6 py-16">
        {order.reviewNotes?.trim() && (
          <div className="border border-amber-300 bg-amber-50 rounded-lg px-4 py-3 mb-6">
            <p className="text-sm font-medium text-amber-950">
              {order.status === "needs_correction" ? "Sent back for correction" : "Review note"}
            </p>
            <p className="text-sm text-amber-900 mt-1 whitespace-pre-wrap">{order.reviewNotes.trim()}</p>
          </div>
        )}
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-2xl font-semibold text-gray-900 inline-flex items-center gap-2">
            Order details
            <NotYetSynced show={order.notYetSynced} />
          </h1>
          <span
            className={
              order.status === "amended"
                ? "text-xs uppercase tracking-wide text-amber-800 border border-amber-300 rounded px-2 py-1"
                : "text-xs uppercase tracking-wide text-gray-500 border border-gray-300 rounded px-2 py-1"
            }
          >
            {statusLabel}
          </span>
        </div>
        <p className="text-gray-600 mb-1">
          {order.patientName} — Lab ID: {order.patientLabId}
        </p>
        {order.patientDeleted && (
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
            This order belongs to a removed patient record and is hidden from active queues. The
            record is retained and can be restored from the recycle bin.
          </p>
        )}
        <p className="text-sm text-gray-400 mb-2">
          Ordered {new Date(order.createdAt).toLocaleString()}
        </p>
        {order.resultsEnteredBy && (
          <p className="text-xs text-gray-400 mb-1">
            Results entered by {order.resultsEnteredBy} at {new Date(order.resultsEnteredAt!).toLocaleString()}
          </p>
        )}
        {order.reviewedBy && (
          <p className={`text-xs text-gray-400 ${order.status === "amended" ? "mb-1" : "mb-6"}`}>
            Released by {order.reviewedBy} at {new Date(order.reviewedAt!).toLocaleString()}
            {order.reviewNotes ? ` — Note: ${order.reviewNotes}` : ""}
          </p>
        )}
        {order.status === "amended" && order.lastAmendedAt && (
          <p className="text-xs text-amber-800 mb-6">
            Amended {new Date(order.lastAmendedAt).toLocaleString()}
            {order.lastAmendedBy ? ` by ${order.lastAmendedBy}` : ""}
            {order.currentResultVersion ? ` — version ${order.currentResultVersion}` : ""}
          </p>
        )}

        <div className="border border-gray-200 rounded-lg p-4 mt-4">
          <h2 className="text-sm font-medium text-gray-900 mb-1">Sample collection</h2>
          <p className="text-sm text-gray-600 mb-3">
            Collection is recorded per specimen. Turnaround uses the latest collection time on this
            order.
          </p>
          {collection.legacySingleCollection && (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
              Legacy single collection timestamp — applied to every specimen on this order. It is
              not rewritten into per-specimen times until each specimen is recorded here.
            </p>
          )}

          <div className="space-y-4">
            {collection.byType.map((specimen) => {
              const collected = Boolean(specimen.collectedAt);
              const editing = editingType === specimen.type;
              return (
                <div key={specimen.type} className="border border-gray-100 rounded-lg p-3">
                  <p className="text-sm font-medium text-gray-900">
                    {SPECIMEN_TYPE_LABELS[specimen.type]}
                  </p>
                  {collected ? (
                    <p className="text-sm text-gray-600 mt-1">
                      Collected {new Date(specimen.collectedAt!).toLocaleString()}
                      {specimen.collectedBy ? ` by ${specimen.collectedBy}` : ""}
                      {specimen.source === "legacy" ? " (legacy)" : ""}
                    </p>
                  ) : (
                    <p className="text-sm text-gray-600 mt-1">
                      Not recorded. Defaults to now with one tap.
                    </p>
                  )}

                  {canCollect && !editing && (
                    <div className="flex gap-3 mt-2">
                      {!collected && (
                        <button
                          onClick={() => recordSampleCollection(specimen.type, new Date().toISOString())}
                          className="bg-gray-900 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-800 transition"
                        >
                          Collected now
                        </button>
                      )}
                      <button
                        onClick={() => {
                          setCollectionTimes((prev) => ({
                            ...prev,
                            [specimen.type]: toDateTimeLocal(specimen.collectedAt),
                          }));
                          setEditingType(specimen.type);
                        }}
                        className="border border-gray-300 rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-50 transition"
                      >
                        {collected ? "Change time" : "Enter another time"}
                      </button>
                    </div>
                  )}

                  {canCollect && editing && (
                    <div className="flex flex-wrap items-center gap-3 mt-2">
                      <input
                        type="datetime-local"
                        value={collectionTimes[specimen.type] || ""}
                        onChange={(e) =>
                          setCollectionTimes((prev) => ({
                            ...prev,
                            [specimen.type]: e.target.value,
                          }))
                        }
                        className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      />
                      <button
                        onClick={() =>
                          recordSampleCollection(
                            specimen.type,
                            fromDateTimeLocal(collectionTimes[specimen.type] || "")
                          )
                        }
                        disabled={!collectionTimes[specimen.type]}
                        className="bg-gray-900 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-800 transition disabled:opacity-50"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditingType(null)}
                        className="text-sm font-medium text-gray-700 underline"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {collection.required.length === 0 && (
            <p className="text-sm text-gray-600">
              {awaitingSample
                ? "No sample recorded yet. Turnaround time is measured from collection, so record it when the sample is physically taken."
                : `Collected ${order.sampleCollectedAt ? new Date(order.sampleCollectedAt).toLocaleString() : ""}`}
            </p>
          )}

          {!canCollect && awaitingSample && (
            <p className="text-xs text-gray-400 mt-3">
              Only a technician, laboratory lead, or owner can record sample collection.
            </p>
          )}
        </div>

        <div className="space-y-3 mt-4">
          {order.tests.map((t) => {
            const definition = getTestDefinition(t.code);
            const isExpanded = expandedTest === t.code;
            return (
              <div key={t.code} className="border border-gray-200 rounded-lg p-4">
                <button
                  onClick={() => setExpandedTest(isExpanded ? null : t.code)}
                  className="w-full flex items-center justify-between text-left"
                >
                  <span className="font-medium text-gray-900">
                    {t.name}
                    <span className="ml-2 text-xs font-normal text-gray-500">
                      {SPECIMEN_TYPE_LABELS[resolveSpecimenType(t.specimenType, t.code, catalog)]}
                    </span>
                  </span>
                  <span className="text-sm text-gray-500">{isExpanded ? "Hide" : "View / enter results"}</span>
                </button>

                {isExpanded && definition && (
                  <div className="mt-4 space-y-3 border-t border-gray-100 pt-4">
                    {definition.parameters.map((p, i) => {
                      const value = results[t.code]?.[p.name] || "";
                      const flag = resultFlag(value, p.referenceRange, patientSex);
                      return (
                      <div key={i} className="grid grid-cols-3 gap-2 items-center">
                        <div>
                          <p className="text-sm text-gray-900">{p.name}</p>
                          <p className="text-xs text-gray-400">
                            Ref: {p.referenceRange} {p.unit !== "—" ? `(${p.unit})` : ""}
                          </p>
                          {!isTestReviewed(definition) && (
                            <p className="text-xs text-amber-800 mt-0.5">
                              {UNREVIEWED_RANGE_CAVEAT}
                            </p>
                          )}
                        </div>
                        <div className="col-span-2 flex items-center gap-2">
                          <input
                            type="text"
                            value={value}
                            onChange={(e) => updateResultValue(t.code, p.name, e.target.value)}
                            disabled={!resultsEditable || !canEnter}
                            placeholder="Result"
                            className="border border-gray-300 rounded px-2 py-1 text-sm flex-1 disabled:bg-gray-50 disabled:text-gray-500"
                          />
                          <ResultFlagMark flag={flag} />
                        </div>
                      </div>
                      );
                    })}
                  </div>
                )}

                {isExpanded && !definition && (
                  <p className="text-sm text-gray-500 mt-3">
                    Test definition not found in catalog — parameters unavailable.
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {resultsEditable && canEnter && (
          <button
            onClick={submitForReview}
            className="w-full bg-gray-900 text-white rounded-lg py-2 font-medium hover:bg-gray-800 transition mt-6"
          >
            Submit results for review
          </button>
        )}

        {canReview && canCorrect && order.status === "results_entered" && (
          <div className="border border-gray-200 rounded-lg p-4 mt-6">
            <h2 className="text-sm font-medium text-gray-900 mb-2">Approve</h2>
            <p className="text-sm text-gray-600 mb-3">
              These results are waiting in the review queue. Check the values above, then approve
              them or send them back for correction.
            </p>
            {!isOnline && (
              <p className="text-sm text-amber-800 mb-3">
                {OFFLINE_RELEASE_MESSAGE}
              </p>
            )}
            {ownResults && (
              <p className="text-sm text-amber-800 mb-3">
                {SELF_RELEASE_MESSAGE}
              </p>
            )}
            <textarea
              value={reviewNotes}
              onChange={(e) => setReviewNotes(e.target.value)}
              placeholder="Reason (required to send back, at least 10 characters)"
              rows={2}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-1"
            />
            <p className="text-xs text-gray-500 mb-3">
              A reason is required to send back. Approval may leave this empty.
            </p>
            <div className="flex gap-3">
              <button
                onClick={approveAndRelease}
                disabled={!isOnline || ownResults}
                title={
                  !isOnline
                    ? OFFLINE_RELEASE_MESSAGE
                    : ownResults
                      ? SELF_RELEASE_MESSAGE
                      : undefined
                }
                className="bg-gray-900 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-800 transition disabled:opacity-50"
              >
                Approve
              </button>
              <button
                onClick={sendBackForCorrection}
                disabled={!isOnline}
                title={!isOnline ? OFFLINE_RELEASE_MESSAGE : undefined}
                className="border border-gray-300 rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-50 transition disabled:opacity-50"
              >
                Send back for correction
              </button>
            </div>
          </div>
        )}

        {released && !canReview && (
          <p className="text-sm text-green-700 mt-6 font-medium">
            {order.status === "amended"
              ? "This report has been amended. Results are locked from further edits."
              : "✓ Results approved and released — locked from further edits."}
          </p>
        )}

        {released && canReview && pendingAmendment && (
          <div className="border border-amber-300 bg-amber-50 rounded-lg p-4 mt-6">
            <h2 className="text-sm font-medium text-amber-950 mb-1">Amendment waiting for confirmation</h2>
            <p className="text-sm text-amber-900 mb-3">
              {pendingInitiator
                ? SECOND_APPROVER_WAITING_MESSAGE
                : "Check the proposed values, then confirm or cancel. The original released values stay on the order."}
            </p>
            <p className="text-xs text-amber-900 mb-2">
              Requested by {pendingAmendment.initiatedBy || "unknown"} at{" "}
              {new Date(pendingAmendment.initiatedAt).toLocaleString()}
            </p>
            <p className="text-sm text-amber-950 whitespace-pre-wrap mb-3">{pendingAmendment.amendmentReason}</p>
            <div className="space-y-2 mb-3">
              {order.tests.map((t) => {
                const definition = getTestDefinition(t.code);
                const params = definition?.parameters ?? [];
                if (params.length === 0) {
                  return (
                    <p key={t.code} className="text-sm text-gray-700">
                      {t.name}: {pendingAmendment.values[t.code] ? JSON.stringify(pendingAmendment.values[t.code]) : "—"}
                    </p>
                  );
                }
                return (
                  <div key={t.code}>
                    <p className="text-sm font-medium text-gray-900">{t.name}</p>
                    {params.map((p) => (
                      <p key={p.name} className="text-sm text-gray-700">
                        {p.name}: {pendingAmendment.values[t.code]?.[p.name] || "—"}
                        {order.results?.[t.code]?.[p.name] !== pendingAmendment.values[t.code]?.[p.name]
                          ? ` (was ${order.results?.[t.code]?.[p.name] || "—"})`
                          : ""}
                      </p>
                    ))}
                  </div>
                );
              })}
            </div>
            {!isOnline && (
              <p className="text-sm text-amber-800 mb-3">{OFFLINE_RELEASE_MESSAGE}</p>
            )}
            <div className="flex gap-3">
              {!pendingInitiator && (
                <button
                  onClick={() => void confirmPendingAmendment()}
                  disabled={!isOnline}
                  title={!isOnline ? OFFLINE_RELEASE_MESSAGE : undefined}
                  className="bg-gray-900 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-800 transition disabled:opacity-50"
                >
                  Confirm amendment
                </button>
              )}
              <button
                onClick={() => void cancelPendingAmendment()}
                disabled={!isOnline}
                title={!isOnline ? OFFLINE_RELEASE_MESSAGE : undefined}
                className="border border-gray-300 rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-50 transition disabled:opacity-50"
              >
                Cancel request
              </button>
            </div>
          </div>
        )}

        {released && canReview && !pendingAmendment && (
          <div className="border border-gray-200 rounded-lg p-4 mt-6">
            <h2 className="text-sm font-medium text-gray-900 mb-2">Amend released result</h2>
            <p className="text-sm text-gray-600 mb-3">
              This writes a new version. The original released values stay on the order.
            </p>
            {!isOnline && <p className="text-sm text-amber-800 mb-3">{OFFLINE_RELEASE_MESSAGE}</p>}
            {originalReleaser && (
              <p className="text-sm text-amber-800 mb-3">{SELF_AMEND_MESSAGE}</p>
            )}
            {!amendOpen ? (
              <button
                onClick={() => {
                  setAmendDraft(cloneResultValues(order.results));
                  setAmendReason("");
                  amendDirty.current = false;
                  setAmendOpen(true);
                }}
                disabled={!isOnline}
                title={!isOnline ? OFFLINE_RELEASE_MESSAGE : undefined}
                className="bg-gray-900 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-800 transition disabled:opacity-50"
              >
                Amend result
              </button>
            ) : (
              <>
                <div className="space-y-3 mb-3">
                  {order.tests.map((t) => {
                    const definition = getTestDefinition(t.code);
                    if (!definition) {
                      return (
                        <p key={t.code} className="text-sm text-gray-500">
                          {t.name}: test definition not found.
                        </p>
                      );
                    }
                    return (
                      <div key={t.code} className="border border-gray-100 rounded-lg p-3">
                        <p className="text-sm font-medium text-gray-900 mb-2">{t.name}</p>
                        {definition.parameters.map((p) => (
                          <label key={p.name} className="flex items-center gap-2 mb-2 last:mb-0">
                            <span className="text-sm text-gray-700 w-40 shrink-0">{p.name}</span>
                            <input
                              type="text"
                              value={amendDraft[t.code]?.[p.name] || ""}
                              onChange={(e) => updateAmendValue(t.code, p.name, e.target.value)}
                              className="border border-gray-300 rounded px-2 py-1 text-sm flex-1"
                            />
                          </label>
                        ))}
                      </div>
                    );
                  })}
                </div>
                <textarea
                  value={amendReason}
                  onChange={(e) => setAmendReason(e.target.value)}
                  placeholder={`Reason (required, at least ${AMENDMENT_REASON_MIN_LENGTH} characters)`}
                  rows={3}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-1"
                />
                <p className="text-xs text-gray-500 mb-3">
                  {amendReason.trim().length}/{AMENDMENT_REASON_MIN_LENGTH} characters
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => void submitAmendment()}
                    disabled={!isOnline}
                    title={!isOnline ? OFFLINE_RELEASE_MESSAGE : undefined}
                    className="bg-gray-900 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-800 transition disabled:opacity-50"
                  >
                    {originalReleaser ? "Submit for second approver" : "Amend result"}
                  </button>
                  <button
                    onClick={() => {
                      setAmendOpen(false);
                      setAmendReason("");
                      amendDirty.current = false;
                      setAmendDraft(cloneResultValues(order.results));
                    }}
                    className="border border-gray-300 rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-50 transition"
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {released && versions.length > 0 && (
          <div className="border border-gray-200 rounded-lg p-4 mt-6">
            <h2 className="text-sm font-medium text-gray-900 mb-2">Result versions</h2>
            <p className="text-sm text-gray-600 mb-3">
              Original released values stay retrievable. Version 1 is the first release.
            </p>
            <div className="space-y-3">
              {versions.map((version) => (
                <div key={version.version} className="border border-gray-100 rounded-lg p-3">
                  <p className="text-sm font-medium text-gray-900">
                    Version {version.version}
                    {version.version === 1 ? " — original release" : " — amendment"}
                  </p>
                  <p className="text-xs text-gray-500 mb-2">
                    {version.version === 1
                      ? `Released by ${version.releasedBy || "unknown"} at ${new Date(version.releasedAt).toLocaleString()}`
                      : `Amended by ${version.amendedBy || "unknown"} at ${new Date(version.releasedAt).toLocaleString()}`}
                    {version.amendedByRole ? ` (${version.amendedByRole}${version.amendedByShift ? ` · ${version.amendedByShift}` : ""})` : ""}
                  </p>
                  {version.amendmentReason && (
                    <p className="text-sm text-gray-700 mb-2 whitespace-pre-wrap">{version.amendmentReason}</p>
                  )}
                  {order.tests.map((t) => (
                    <p key={`${version.version}-${t.code}`} className="text-sm text-gray-700">
                      {t.name}:{" "}
                      {Object.entries(version.values[t.code] || {})
                        .map(([name, value]) => `${name} ${value || "—"}`)
                        .join(", ") || "—"}
                    </p>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

        {status && <p className="text-sm text-gray-600 mt-3">{status}</p>}
      </div>
    </main>
  );
}

export default function OrderDetail() {
  const params = useParams();
  const orderId = params.orderId as string;
  return (
    <ProtectedRoute
      require={(role) => canEnterResults(role) || canRecordSampleCollection(role)}
    >
      <OrderDetailContent key={orderId} />
    </ProtectedRoute>
  );
}
