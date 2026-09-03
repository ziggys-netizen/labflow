"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../../lib/AuthContext";
import { db } from "../../lib/firebase";
import { doc, getDocs, increment, writeBatch } from "firebase/firestore";
import { LabTest, SPECIMEN_TYPE_LABELS, resolveSpecimenType, type SpecimenType } from "../../lib/testCatalog";
import { isTestReviewed, UNREVIEWED_RANGE_CAVEAT } from "../../lib/catalogSeed";
import ProtectedRoute from "../../lib/ProtectedRoute";
import AppNav from "../../lib/AppNav";
import NotYetSynced from "../../lib/NotYetSynced";
import PrintIcon from "../../lib/PrintIcon";
import { clinicCollectionQuery, isOwner, ownerActingReviewFields } from "../../lib/clinicScope";
import { subscribeDocument } from "../../lib/clinicListen";
import { useConnection } from "../../lib/ConnectionContext";
import { trackedBatchCommit, trackedSetDoc, writeActorFromUser } from "../../lib/trackedWrites";
import {
  canApproveResults,
  canCancelOrder,
  canEnterResults,
  canOrderTests,
  canRecordCriticalNotification,
  canRecordSampleCollection,
  canRejectSample,
  canSendBackForCorrection,
} from "../../lib/permissions";
import { actorFromAuth, auditTargetLabel, safeLogAudit } from "../../lib/audit";
import { patientDisplayName } from "../../lib/patientDisplay";
import {
  OFFLINE_AMENDMENT_MESSAGE,
  SELF_RELEASE_MESSAGE,
  SEND_BACK_REASON_MESSAGE,
  isSelfRelease,
} from "../../lib/reviewQueue";
import {
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
  AMENDMENT_CODES,
  CRITICAL_NOTIFY_MEANS,
  CRITICAL_NOTIFY_OUTCOMES,
  ORDER_CANCEL_CODES,
  SAMPLE_REJECTION_CODES,
  SELF_RELEASE_CODES,
  SEND_BACK_CODES,
  formatJustification,
  justificationReady,
} from "../../lib/reasonCodes";
import { canCancelStatus, canEnterResultsForStatus, canRejectStatus, canReleaseStatus, orderDisplayLabel } from "../../lib/orderLifecycle";
import { nceFromRejection } from "../../lib/nonconformingEvents";
import { criticalNotificationReady, parseCriticalNotification } from "../../lib/criticalResults";
import { orderHasCriticalResults, parseAgeYears } from "../../lib/resultFlag";
import ReasonCodeField from "../../lib/ReasonCodeField";
import ResultValueField from "../../lib/ResultValueField";
import { useWriteIdentity } from "../../lib/pinSession";
import { SensitivePinPrompt } from "../../lib/PinGate";
import type { SensitivePinAction } from "../../lib/pinIdentity";
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
import { clearResultDraft, loadResultDraft, saveResultDraft } from "../../lib/rosterDrafts";
import {
  DAILY_TEST_VALUE_ROLLUPS,
  catalogPriceIndex,
  releasedOrderContribution,
  rollupDocumentId,
  rollupMergeFields,
} from "../../lib/dailyTestValueRollup";

interface OrderTest {
  code: string;
  name: string;
  specimenType?: string | null;
}

interface OrderData {
  patientId: string;
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
  selfReleased?: boolean;
  rejectionReasonCode?: string | null;
  rejectionNote?: string | null;
  criticalNotification?: unknown;
  needsFinalReprint?: boolean;
  provisionalPrintedAt?: string | null;
  recollectionOfOrderId?: string | null;
  episodeAlreadyCharged?: boolean;
  valueRollupAppliedAt?: string | null;
}

function OrderDetailContent() {
  const params = useParams();
  const { user, role, clinicId, shift, username } = useAuth();
  const writer = useWriteIdentity();
  const { isOnline } = useConnection();
  const orderId = params.orderId as string;

  const [order, setOrder] = useState<OrderData | null>(null);
  const [catalog, setCatalog] = useState<LabTest[]>([]);
  const [loadedOrderId, setLoadedOrderId] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, Record<string, string>>>({});
  const [sendBackCode, setSendBackCode] = useState("");
  const [sendBackNote, setSendBackNote] = useState("");
  const [selfReleaseCode, setSelfReleaseCode] = useState("");
  const [selfReleaseNote, setSelfReleaseNote] = useState("");
  const [rejectCode, setRejectCode] = useState("");
  const [rejectNote, setRejectNote] = useState("");
  const [cancelCode, setCancelCode] = useState("");
  const [cancelNote, setCancelNote] = useState("");
  const [criticalName, setCriticalName] = useState("");
  const [criticalMeans, setCriticalMeans] = useState("phone");
  const [criticalOutcome, setCriticalOutcome] = useState("read_back_ok");
  const [pinAction, setPinAction] = useState<SensitivePinAction | null>(null);
  const [pendingSensitive, setPendingSensitive] = useState<null | (() => void)>(null);
  const [amendDraft, setAmendDraft] = useState<ResultValues>({});
  const [amendReason, setAmendReason] = useState("");
  const [amendNote, setAmendNote] = useState("");
  const [amendOpen, setAmendOpen] = useState(false);
  const [status, setStatus] = useState("");
  const [expandedTest, setExpandedTest] = useState<string | null>(null);
  const [collectionTimes, setCollectionTimes] = useState<Partial<Record<SpecimenType, string>>>({});
  const [editingType, setEditingType] = useState<SpecimenType | null>(null);
  const [patientRecord, setPatientRecord] = useState<{
    id: string;
    name: string;
    sex: string | null;
    dob: string | null;
    ageYears: number | null;
  } | null>(null);
  const resultsDirty = useRef(false);
  const amendDirty = useRef(false);
  const releasing = useRef(false);
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
          if (!resultsDirty.current) {
            const draft = loadResultDraft(orderId);
            if (draft && Object.keys(draft.results).length > 0) {
              resultsDirty.current = true;
              setResults(draft.results);
              if (draft.amendDraft && Object.keys(draft.amendDraft).length > 0) {
                amendDirty.current = true;
                setAmendDraft(draft.amendDraft);
              } else {
                setAmendDraft(cloneResultValues(data.results));
              }
            } else {
              setResults(data.results || {});
              if (!amendDirty.current) setAmendDraft(cloneResultValues(data.results));
            }
          } else if (!amendDirty.current) {
            setAmendDraft(cloneResultValues(data.results));
          }
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
        const data = snap.exists() ? snap.data() : null;
        setPatientRecord({
          id: patientId,
          name: patientDisplayName(data),
          sex: typeof data?.sex === "string" ? data.sex : null,
          dob: typeof data?.dob === "string" ? data.dob : null,
          ageYears: parseAgeYears(data?.ageYears),
        });
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

  const resultsEditable = order && canEnterResultsForStatus(order.status);

  function withPin(action: SensitivePinAction, run: () => void) {
    setPendingSensitive(() => run);
    setPinAction(action);
  }

  function updateResultValue(testCode: string, paramName: string, value: string) {
    if (!resultsEditable || !canEnterResults(role)) return;
    resultsDirty.current = true;
    setResults((prev) => {
      const next = {
        ...prev,
        [testCode]: {
          ...(prev[testCode] || {}),
          [paramName]: value,
        },
      };
      saveResultDraft({
        orderId,
        results: next,
        amendDraft,
        savedAt: new Date().toISOString(),
      });
      return next;
    });
  }

  function orderWriteMeta(summary: string, expected: Record<string, unknown>) {
    return {
      ...writeActorFromUser(
        { uid: writer.uid || user?.uid || "", email: writer.email },
        writer.username
      ),
      operation: "update" as const,
      summary,
      clinicId: order?.clinicId || clinicId,
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
        `Recorded ${SPECIMEN_TYPE_LABELS[type].toLowerCase()} collection for ${order?.patientLabId ?? "order"}`,
        { sampleCollections: { [type]: { collectedAt: iso } } }
      )
    );
    auditOrder("order.sampleCollected", { specimenType: type, source: SAMPLE_COLLECTED_SOURCE.order });
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
      resultsEnteredBy: writer.email,
      resultsEnteredByUid: writer.uid,
      resultsEnteredAt: new Date().toISOString(),
      clinicId: order?.clinicId || clinicId || undefined,
    };
    await trackedSetDoc(
      doc(db, "orders", orderId),
      updates,
      { merge: true },
      orderWriteMeta(`Entered results for ${order?.patientLabId ?? "order"}`, {
        status: "results_entered",
      })
    );
    resultsDirty.current = false;
    clearResultDraft(orderId);
    setOrder((prev) => (prev ? { ...prev, ...updates, notYetSynced: true } : prev));
    auditOrder("order.resultsEntered", { status: "results_entered" });
    setStatus("Results submitted for review.");
    setTimeout(() => setStatus(""), 2500);
  }

  function auditOrder(
    action:
      | "order.approved"
      | "order.sentBack"
      | "order.amended"
      | "order.sampleCollected"
      | "order.resultsEntered"
      | "order.rejected"
      | "order.cancelled"
      | "order.criticalNotified",
    detail?: Record<string, unknown>
  ) {
    const actor = actorFromAuth(
      { uid: writer.uid || user?.uid || "", email: writer.email },
      writer.role,
      writer.shift
    );
    if (!actor) return;
    safeLogAudit({
      clinicId: order?.clinicId || clinicId || null,
      actor,
      action,
      targetCollection: "orders",
      targetId: orderId,
      targetLabel: auditTargetLabel(order?.patientLabId, "order"),
      detail,
    });
  }

  function amendmentActor(): AmendmentActor | null {
    if (!writer.uid) return null;
    return { uid: writer.uid, email: writer.email, role: writer.role, shift: writer.shift };
  }

  async function approveAndRelease() {
    if (!user || !canApproveResults(writer.role || role)) return;
    const ownResults = isSelfRelease(order?.resultsEnteredBy, writer.email);
    if (ownResults && !justificationReady(SELF_RELEASE_CODES, selfReleaseCode, selfReleaseNote)) {
      setStatus(SELF_RELEASE_MESSAGE);
      return;
    }
    withPin("release", () => void commitRelease(ownResults));
  }

  async function commitRelease(ownResults: boolean) {
    if (!order || releasing.current) return;
    if (!canReleaseStatus(order.status)) return;
    releasing.current = true;
    setStatus("Approving...");
    const releasedAtDate = new Date();
    const releasedAt = releasedAtDate.toISOString();
    const releasedValues = cloneResultValues(order?.results || results);
    const v1 = firstReleaseVersion({
      values: releasedValues,
      releasedBy: writer.email,
      releasedByUid: writer.uid,
      releasedAt,
    });
    const clinic = order.clinicId || clinicId || "";
    const contribution = releasedOrderContribution({
      clinicId: clinic,
      releasedAt: releasedAtDate,
      fromStatus: order.status,
      tests: order.tests,
      recollectionOfOrderId: order.recollectionOfOrderId,
      episodeAlreadyCharged: order.episodeAlreadyCharged,
      valueRollupAppliedAt: order.valueRollupAppliedAt,
      prices: catalogPriceIndex(catalog),
    });
    const updates = {
      status: "approved",
      reviewedBy: writer.email,
      reviewedAt: releasedAt,
      reviewNotes: "",
      reviewedByUid: writer.uid,
      reviewedByRole: writer.role,
      reviewedByShift: writer.shift ?? null,
      resultVersions: [v1],
      currentResultVersion: 1,
      pendingAmendment: null,
      pendingAmendmentAt: null,
      selfReleased: ownResults,
      selfReleaseReasonCode: ownResults ? selfReleaseCode : null,
      needsFinalReprint: !isOnline,
      ...(contribution ? { valueRollupAppliedAt: releasedAt } : {}),
      ...ownerActingReviewFields(writer.role || role),
    };
    const actorMeta = writeActorFromUser(
      { uid: writer.uid || user?.uid || "", email: writer.email },
      writer.username
    );
    try {
      if (contribution) {
        const batch = writeBatch(db);
        const orderRef = doc(db, "orders", orderId);
        const rollupRef = doc(
          db,
          DAILY_TEST_VALUE_ROLLUPS,
          rollupDocumentId(contribution.clinicId, contribution.date)
        );
        batch.set(orderRef, updates, { merge: true });
        batch.set(rollupRef, rollupMergeFields(contribution, releasedAt, increment), { merge: true });
        await trackedBatchCommit(batch, [
          {
            ...orderWriteMeta(`Released results for ${order.patientLabId ?? "order"}`, {
              status: "approved",
            }),
            collection: "orders",
            documentId: orderId,
          },
          {
            ...actorMeta,
            operation: "update",
            collection: DAILY_TEST_VALUE_ROLLUPS,
            documentId: rollupRef.id,
            summary: "Daily test value rollup",
            clinicId: contribution.clinicId,
            expected: null,
          },
        ]);
      } else {
        await trackedSetDoc(
          doc(db, "orders", orderId),
          updates,
          { merge: true },
          orderWriteMeta(`Released results for ${order.patientLabId ?? "order"}`, {
            status: "approved",
          })
        );
      }
      setOrder((prev) => (prev ? { ...prev, ...updates, notYetSynced: true } : prev));
      auditOrder("order.approved", {
        status: "approved",
        selfReleased: ownResults,
        selfReleaseReasonCode: ownResults ? selfReleaseCode : null,
      });
      setStatus(
        isOnline
          ? "Results approved and released."
          : "Results released on this device. Print will be marked provisional until sync."
      );
      setTimeout(() => setStatus(""), 4000);
    } finally {
      releasing.current = false;
    }
  }

  async function sendBackForCorrection() {
    if (!user || !canSendBackForCorrection(writer.role || role)) return;
    if (!justificationReady(SEND_BACK_CODES, sendBackCode, sendBackNote)) {
      setStatus(SEND_BACK_REASON_MESSAGE);
      return;
    }
    const notes = formatJustification(SEND_BACK_CODES, sendBackCode, sendBackNote);
    setStatus("Sending back...");
    const updates = {
      status: "needs_correction",
      reviewedBy: writer.email,
      reviewedAt: new Date().toISOString(),
      reviewNotes: notes,
      sendBackReasonCode: sendBackCode,
      reviewedByUid: writer.uid,
      reviewedByRole: writer.role,
      reviewedByShift: writer.shift ?? null,
      ...ownerActingReviewFields(writer.role || role),
    };
    await trackedSetDoc(
      doc(db, "orders", orderId),
      updates,
      { merge: true },
      orderWriteMeta(`Sent results back for ${order?.patientLabId ?? "order"}`, {
        status: "needs_correction",
      })
    );
    setOrder((prev) => (prev ? { ...prev, ...updates, notYetSynced: true } : prev));
    auditOrder("order.sentBack", { status: "needs_correction", reasonCode: sendBackCode });
    setSendBackCode("");
    setSendBackNote("");
    setStatus("Sent back for correction.");
    setTimeout(() => setStatus(""), 2500);
  }

  async function rejectSample() {
    if (!user || !canRejectSample(writer.role || role) || !order) return;
    if (!canRejectStatus(order.status)) return;
    if (!justificationReady(SAMPLE_REJECTION_CODES, rejectCode, rejectNote)) {
      setStatus("Choose a reason to reject this sample.");
      return;
    }
    const now = new Date().toISOString();
    const nce = nceFromRejection({
      clinicId: order.clinicId || clinicId || "",
      orderId,
      patientLabId: order.patientLabId,
      reasonCode: rejectCode,
      reasonNote: rejectNote,
      actorUid: writer.uid,
      now,
    });
    const updates = {
      status: "rejected",
      rejectionReasonCode: rejectCode,
      rejectionNote: rejectNote,
      rejectedAt: now,
      rejectedByUid: writer.uid,
      clinicId: order.clinicId || clinicId || undefined,
    };
    await trackedSetDoc(
      doc(db, "orders", orderId),
      updates,
      { merge: true },
      orderWriteMeta(`Rejected sample for ${order.patientLabId}`, { status: "rejected" })
    );
    if (nce.clinicId) {
      await trackedSetDoc(
        doc(db, "nonconformingEvents", `${orderId}_reject`),
        nce,
        { merge: true },
        {
          ...writeActorFromUser({ uid: writer.uid, email: writer.email }, writer.username),
          operation: "create" as const,
          summary: `Nonconforming event for ${order.patientLabId}`,
          clinicId: nce.clinicId,
          orderId,
          expected: { status: "open" },
        }
      );
    }
    setOrder((prev) => (prev ? { ...prev, ...updates, notYetSynced: true } : prev));
    auditOrder("order.rejected", { reasonCode: rejectCode });
    setStatus("Sample rejected. A nonconforming event was recorded.");
    setTimeout(() => setStatus(""), 4000);
  }

  async function cancelOrder() {
    if (!user || !canCancelOrder(writer.role || role) || !order) return;
    if (!canCancelStatus(order.status)) return;
    if (!justificationReady(ORDER_CANCEL_CODES, cancelCode, cancelNote)) {
      setStatus("Choose a reason to stop this order.");
      return;
    }
    const updates = {
      status: "cancelled",
      cancelReasonCode: cancelCode,
      cancelNote,
      cancelledAt: new Date().toISOString(),
      cancelledByUid: writer.uid,
    };
    await trackedSetDoc(
      doc(db, "orders", orderId),
      updates,
      { merge: true },
      orderWriteMeta(`Cancelled order for ${order.patientLabId}`, { status: "cancelled" })
    );
    setOrder((prev) => (prev ? { ...prev, ...updates, notYetSynced: true } : prev));
    auditOrder("order.cancelled", { reasonCode: cancelCode });
    setStatus("Order stopped.");
    setTimeout(() => setStatus(""), 2500);
  }

  async function recordCriticalNotification() {
    if (!user || !canRecordCriticalNotification(writer.role || role) || !order) return;
    if (!criticalNotificationReady({ notifiedName: criticalName, means: criticalMeans, outcome: criticalOutcome })) {
      setStatus("Record who was told, how, and the outcome.");
      return;
    }
    const notification = {
      notifiedName: criticalName.trim(),
      means: criticalMeans,
      outcome: criticalOutcome,
      notifiedByUid: writer.uid,
      notifiedBy: writer.email,
      at: new Date().toISOString(),
      readBack: criticalOutcome === "read_back_ok",
    };
    await trackedSetDoc(
      doc(db, "orders", orderId),
      { criticalNotification: notification },
      { merge: true },
      orderWriteMeta(`Recorded critical notification for ${order.patientLabId}`, {
        criticalNotification: notification,
      })
    );
    setOrder((prev) => (prev ? { ...prev, criticalNotification: notification, notYetSynced: true } : prev));
    auditOrder("order.criticalNotified", { outcome: criticalOutcome });
    setStatus("Critical-result communication recorded.");
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
      setStatus(OFFLINE_AMENDMENT_MESSAGE);
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
      reasonNote: amendNote,
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
          ? `Requested amendment for ${order.patientLabId}`
          : `Amended results for ${order.patientLabId}`,
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
      auditOrder(
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
      setStatus(OFFLINE_AMENDMENT_MESSAGE);
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
      orderWriteMeta(`Confirmed amendment for ${order.patientLabId}`, { status: "amended" })
    );
    setOrder((prev) => (prev ? { ...prev, ...result.updates, notYetSynced: true } : prev));
    setResults(result.updates.results as ResultValues);
    const pending = parsePendingAmendment(order.pendingAmendment);
    auditOrder(
      "order.amended",
      amendmentAuditDetail({
        reason: pending?.amendmentReasonCode || "",
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
      setStatus(OFFLINE_AMENDMENT_MESSAGE);
      return;
    }
    const updates = cancelPendingAmendmentUpdates();
    await trackedSetDoc(
      doc(db, "orders", orderId),
      updates,
      { merge: true },
      orderWriteMeta(`Cancelled pending amendment for ${order.patientLabId}`, { pendingAmendmentAt: null })
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

  const actingRole = writer.role || role;
  const canReview = canApproveResults(actingRole);
  const canCorrect = canSendBackForCorrection(actingRole);
  const canCollect = canRecordSampleCollection(actingRole);
  const canEnter = canEnterResults(actingRole);
  const ownResults = isSelfRelease(order.resultsEnteredBy, writer.email);
  const patientSex = patientRecord?.id === order.patientId ? patientRecord.sex : null;
  const patientDob = patientRecord?.id === order.patientId ? patientRecord.dob : null;
  const patientAgeYears = patientRecord?.id === order.patientId ? patientRecord.ageYears : null;
  const flagCtx = { sex: patientSex, dob: patientDob, ageYears: patientAgeYears };
  const collection = interpretCollection(order, catalog);
  const awaitingSample = !collection.allCollected;
  const statusLabel = orderDisplayLabel(order, catalog).label;
  const released = isReleasedResultStatus(order.status);
  const pendingAmendment = parsePendingAmendment(order.pendingAmendment);
  const versions = ensureResultVersions(order);
  const originalReleaser = actorIsOriginalReleaser(order, { uid: writer.uid, email: writer.email });
  const pendingInitiator = actorIsPendingInitiator(pendingAmendment, {
    uid: writer.uid,
    email: writer.email,
  });
  const critical = orderHasCriticalResults(order.tests, order.results || results, catalog, flagCtx);
  const criticalRecord = parseCriticalNotification(order.criticalNotification);

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
          {patientRecord?.name || "Patient"} — Lab ID: {order.patientLabId}
        </p>
        {released && order.patientId && (
          <p className="mb-3">
            <Link
              href={`/patients/${order.patientId}/print`}
              className="inline-flex items-center gap-1.5 text-sm text-gray-900 underline"
            >
              <PrintIcon className="h-3.5 w-3.5" />
              Print report
            </Link>
          </p>
        )}
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
                    {definition.parameters.map((p) => (
                      <div key={p.name}>
                        <ResultValueField
                          parameter={p}
                          value={results[t.code]?.[p.name] || ""}
                          sex={patientSex}
                          dob={patientDob}
                          ageYears={patientAgeYears}
                          disabled={!resultsEditable || !canEnter}
                          onChange={(value) => updateResultValue(t.code, p.name, value)}
                        />
                        {!isTestReviewed(definition) && (
                          <p className="text-xs text-amber-800 mt-0.5">{UNREVIEWED_RANGE_CAVEAT}</p>
                        )}
                      </div>
                    ))}
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
            <h2 className="text-sm font-medium text-gray-900 mb-2">Ready to release</h2>
            <p className="text-sm text-gray-600 mb-3">
              Open the values above, then release or send back. Release is not offered from the list.
            </p>
            {!isOnline && (
              <p className="text-sm text-amber-800 mb-3">
                Offline release is allowed. A printed copy will be marked provisional until sync.
              </p>
            )}
            {ownResults && (
              <div className="mb-3">
                <p className="text-sm text-amber-800 mb-2">{SELF_RELEASE_MESSAGE}</p>
                <ReasonCodeField
                  list={SELF_RELEASE_CODES}
                  code={selfReleaseCode}
                  note={selfReleaseNote}
                  onCode={setSelfReleaseCode}
                  onNote={setSelfReleaseNote}
                  label="Self-release reason"
                />
              </div>
            )}
            <ReasonCodeField
              list={SEND_BACK_CODES}
              code={sendBackCode}
              note={sendBackNote}
              onCode={setSendBackCode}
              onNote={setSendBackNote}
              label="Send-back reason"
            />
            <div className="flex gap-3 mt-3">
              <button
                onClick={approveAndRelease}
                disabled={ownResults && !justificationReady(SELF_RELEASE_CODES, selfReleaseCode, selfReleaseNote)}
                className="bg-gray-900 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-800 transition disabled:opacity-50"
              >
                Release
              </button>
              <button
                onClick={sendBackForCorrection}
                className="border border-gray-300 rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-50 transition"
              >
                Send back
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
              <p className="text-sm text-amber-800 mb-3">{OFFLINE_AMENDMENT_MESSAGE}</p>
            )}
            <div className="flex gap-3">
              {!pendingInitiator && (
                <button
                  onClick={() => void confirmPendingAmendment()}
                  disabled={!isOnline}
                  title={!isOnline ? OFFLINE_AMENDMENT_MESSAGE : undefined}
                  className="bg-gray-900 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-800 transition disabled:opacity-50"
                >
                  Confirm amendment
                </button>
              )}
              <button
                onClick={() => void cancelPendingAmendment()}
                disabled={!isOnline}
                title={!isOnline ? OFFLINE_AMENDMENT_MESSAGE : undefined}
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
            {!isOnline && <p className="text-sm text-amber-800 mb-3">{OFFLINE_AMENDMENT_MESSAGE}</p>}
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
                title={!isOnline ? OFFLINE_AMENDMENT_MESSAGE : undefined}
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
                <ReasonCodeField
                  list={AMENDMENT_CODES}
                  code={amendReason}
                  note={amendNote}
                  onCode={setAmendReason}
                  onNote={setAmendNote}
                  label="Amendment reason"
                />
                <div className="flex gap-3">
                  <button
                    onClick={() => withPin("amendment", () => void submitAmendment())}
                    disabled={!isOnline}
                    title={!isOnline ? OFFLINE_AMENDMENT_MESSAGE : undefined}
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

        {canRejectSample(actingRole) && canRejectStatus(order.status) && (
          <div className="border border-red-200 rounded-lg p-4 mt-6">
            <h2 className="text-sm font-medium text-gray-900 mb-2">Cannot test</h2>
            <p className="text-sm text-gray-600 mb-3">
              Reject an untestable sample. This records a nonconforming event.
            </p>
            <ReasonCodeField
              list={SAMPLE_REJECTION_CODES}
              code={rejectCode}
              note={rejectNote}
              onCode={setRejectCode}
              onNote={setRejectNote}
            />
            <button
              onClick={() => void rejectSample()}
              className="mt-3 border border-red-300 text-red-800 rounded-lg px-4 py-2 text-sm font-medium hover:bg-red-50"
            >
              Reject sample
            </button>
          </div>
        )}

        {order.status === "rejected" && order.patientId && canOrderTests(actingRole) && (
          <div className="border border-gray-200 rounded-lg p-4 mt-6">
            <h2 className="text-sm font-medium text-gray-900 mb-2">Recollection</h2>
            <p className="text-sm text-gray-600 mb-3">
              Create a linked order for a new sample. A rejected sample is not counted. The
              recollection is the delivered test and is charged once for this episode.
            </p>
            <Link
              href={`/orders/new/${order.patientId}?recollectFrom=${orderId}`}
              className="text-sm text-gray-900 underline font-medium"
            >
              Create a recollection order
            </Link>
          </div>
        )}

        {canCancelOrder(actingRole) && canCancelStatus(order.status) && (
          <div className="border border-gray-200 rounded-lg p-4 mt-6">
            <h2 className="text-sm font-medium text-gray-900 mb-2">Stop this order</h2>
            <ReasonCodeField
              list={ORDER_CANCEL_CODES}
              code={cancelCode}
              note={cancelNote}
              onCode={setCancelCode}
              onNote={setCancelNote}
            />
            <button
              onClick={() => void cancelOrder()}
              className="mt-3 border border-gray-300 rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-50"
            >
              Cancel order
            </button>
          </div>
        )}

        {released && critical && canRecordCriticalNotification(actingRole) && (
          <div className="border border-red-200 bg-red-50 rounded-lg p-4 mt-6">
            <h2 className="text-sm font-medium text-red-950 mb-2">Critical result communication</h2>
            {criticalRecord ? (
              <p className="text-sm text-red-900">
                {criticalRecord.notifiedName} · {criticalRecord.means} · {criticalRecord.outcome} ·{" "}
                {new Date(criticalRecord.at).toLocaleString()}
              </p>
            ) : (
              <>
                <p className="text-sm text-red-900 mb-3">
                  Release is not blocked. Record who was told, by what means, and the outcome.
                </p>
                <label className="block text-sm text-gray-700 mb-2">
                  Who was notified
                  <input
                    value={criticalName}
                    onChange={(e) => setCriticalName(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                  />
                </label>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <select
                    value={criticalMeans}
                    onChange={(e) => setCriticalMeans(e.target.value)}
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  >
                    {CRITICAL_NOTIFY_MEANS.map((item) => (
                      <option key={item.code} value={item.code}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                  <select
                    value={criticalOutcome}
                    onChange={(e) => setCriticalOutcome(e.target.value)}
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  >
                    {CRITICAL_NOTIFY_OUTCOMES.map((item) => (
                      <option key={item.code} value={item.code}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={() => void recordCriticalNotification()}
                  className="bg-gray-900 text-white rounded-lg px-4 py-2 text-sm font-medium"
                >
                  Record notification
                </button>
              </>
            )}
          </div>
        )}

        {status && <p className="text-sm text-gray-600 mt-3">{status}</p>}
        {pinAction && pendingSensitive && (
          <SensitivePinPrompt
            action={pinAction}
            onClose={() => {
              setPinAction(null);
              setPendingSensitive(null);
            }}
            onConfirmed={() => {
              const run = pendingSensitive;
              setPinAction(null);
              setPendingSensitive(null);
              run();
            }}
          />
        )}
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
