import {
  doc,
  setDoc,
  updateDoc,
  type CollectionReference,
  type DocumentData,
  type DocumentReference,
  type SetOptions,
  type UpdateData,
  type WriteBatch,
} from "firebase/firestore";
import { lastKnownOnline } from "./firestoreConnectivity";
import {
  enqueuePending,
  markConfirmed,
  markRejected,
  type NewTrackedWrite,
  type WriteOperation,
} from "./writeQueue";

export interface WriteContext {
  operation?: WriteOperation;
  summary: string;
  actorUid: string;
  actorLabel: string;
  clinicId?: string | null;
  patientName?: string | null;
  patientLabId?: string | null;
  orderId?: string | null;
  expected?: Record<string, unknown> | null;
}

export function writeActorFromUser(
  user: { uid: string; email: string | null } | null,
  username: string | null
): { actorUid: string; actorLabel: string } {
  return {
    actorUid: user?.uid ?? "unknown",
    actorLabel: username || user?.email || user?.uid || "unknown",
  };
}

function firestoreErrorCode(err: unknown): string {
  if (typeof err === "object" && err !== null && "code" in err) {
    return String((err as { code: unknown }).code).replace(/^firestore\//, "");
  }
  return "";
}

function rejectionCopy(err: unknown, wroteWhileOffline: boolean): {
  reason: string;
  permissionChanged: boolean;
} {
  const code = firestoreErrorCode(err);
  if (code === "permission-denied") {
    if (wroteWhileOffline) {
      return {
        reason:
          "Your permissions changed while you were offline. These changes were not saved.",
        permissionChanged: true,
      };
    }
    return {
      reason: "You do not have permission to save this change.",
      permissionChanged: false,
    };
  }
  const message = err instanceof Error && err.message ? err.message : "The server rejected this change.";
  return { reason: message, permissionChanged: false };
}

function attachWatch(id: string, promise: Promise<unknown>, wroteWhileOffline: boolean) {
  promise.then(
    () => {
      void markConfirmed(id);
    },
    (err: unknown) => {
      const { reason, permissionChanged } = rejectionCopy(err, wroteWhileOffline);
      void markRejected(id, reason, permissionChanged);
    }
  );
}

async function record(ctx: NewTrackedWrite): Promise<string> {
  const entry = await enqueuePending({
    ...ctx,
    wroteWhileOffline: ctx.wroteWhileOffline ?? !lastKnownOnline(),
  });
  return entry.id;
}

/**
 * Roster windows are not applied here. A write queued offline and synced
 * outside the roster is retained — the work happened. See PRD §5.2.1.
 */
export async function trackedSetDoc(
  ref: DocumentReference,
  data: DocumentData,
  options: SetOptions | undefined,
  ctx: WriteContext
): Promise<DocumentReference> {
  const wroteWhileOffline = !lastKnownOnline();
  const id = await record({
    operation: ctx.operation ?? "update",
    collection: ref.parent.id,
    documentId: ref.id,
    actorUid: ctx.actorUid,
    actorLabel: ctx.actorLabel,
    clinicId: ctx.clinicId,
    patientName: ctx.patientName,
    patientLabId: ctx.patientLabId,
    orderId: ctx.orderId ?? (ref.parent.id === "orders" ? ref.id : null),
    summary: ctx.summary,
    expected: ctx.expected ?? null,
    wroteWhileOffline,
  });
  const promise = options ? setDoc(ref, data, options) : setDoc(ref, data);
  attachWatch(id, promise, wroteWhileOffline);
  return ref;
}

export async function trackedUpdateDoc(
  ref: DocumentReference,
  data: UpdateData<DocumentData>,
  ctx: WriteContext
): Promise<void> {
  const wroteWhileOffline = !lastKnownOnline();
  const id = await record({
    operation: ctx.operation ?? "update",
    collection: ref.parent.id,
    documentId: ref.id,
    actorUid: ctx.actorUid,
    actorLabel: ctx.actorLabel,
    clinicId: ctx.clinicId,
    patientName: ctx.patientName,
    patientLabId: ctx.patientLabId,
    orderId: ctx.orderId ?? (ref.parent.id === "orders" ? ref.id : null),
    summary: ctx.summary,
    expected: ctx.expected ?? null,
    wroteWhileOffline,
  });
  attachWatch(id, updateDoc(ref, data), wroteWhileOffline);
}

export async function trackedAddDoc(
  col: CollectionReference,
  data: DocumentData,
  ctx: WriteContext
): Promise<DocumentReference> {
  const ref = doc(col);
  await trackedSetDoc(ref, data, undefined, { ...ctx, operation: "create" });
  return ref;
}

export async function trackedBatchCommit(
  batch: WriteBatch,
  parts: Array<WriteContext & { collection: string; documentId: string; operation?: WriteOperation }>
): Promise<void> {
  const wroteWhileOffline = !lastKnownOnline();
  const ids: string[] = [];
  for (const part of parts) {
    ids.push(
      await record({
        operation: part.operation ?? "batch",
        collection: part.collection,
        documentId: part.documentId,
        actorUid: part.actorUid,
        actorLabel: part.actorLabel,
        clinicId: part.clinicId,
        patientName: part.patientName,
        patientLabId: part.patientLabId,
        orderId: part.orderId,
        summary: part.summary,
        expected: part.expected ?? null,
        wroteWhileOffline,
      })
    );
  }
  const promise = batch.commit();
  promise.then(
    () => {
      ids.forEach((id) => void markConfirmed(id));
    },
    (err: unknown) => {
      const { reason, permissionChanged } = rejectionCopy(err, wroteWhileOffline);
      ids.forEach((id) => void markRejected(id, reason, permissionChanged));
    }
  );
}
