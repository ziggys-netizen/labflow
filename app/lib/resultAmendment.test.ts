import { describe, expect, it } from "vitest";
import { getTimeWindow, isWithin } from "./datetime";
import {
  AMENDMENT_NO_CHANGE_MESSAGE,
  AMENDMENT_REASON_MESSAGE,
  CANNOT_CONFIRM_OWN_AMENDMENT_MESSAGE,
  amendmentAuditDetail,
  amendmentBlockedOffline,
  amendmentReasonReady,
  actorIsOriginalReleaser,
  changedResultValues,
  confirmAmendment,
  countAmendmentsInWindow,
  ensureResultVersions,
  firstReleaseVersion,
  isReleasedResultStatus,
  originalResultVersion,
  startAmendment,
  type AmendmentActor,
  type AmendmentOrderInput,
  type ResultValues,
} from "./resultAmendment";

const MANAGER: AmendmentActor = {
  uid: "mgr-1",
  email: "manager@lab.test",
  role: "lab_manager",
  shift: null,
};

const SUPERVISOR: AmendmentActor = {
  uid: "sup-1",
  email: "night@lab.test",
  role: "lab_supervisor",
  shift: "night",
};

const OWNER: AmendmentActor = {
  uid: "owner-1",
  email: "owner@lab.test",
  role: "owner",
  shift: null,
};

const ORIGINAL: ResultValues = { FBC: { Hb: "12.0", WBC: "6.1" } };
const CORRECTED: ResultValues = { FBC: { Hb: "13.4", WBC: "6.1" } };

function approvedOrder(overrides: Partial<AmendmentOrderInput> = {}): AmendmentOrderInput {
  const releasedAt = "2026-08-20T09:00:00.000Z";
  return {
    status: "approved",
    results: clone(ORIGINAL),
    reviewedBy: MANAGER.email,
    reviewedByUid: MANAGER.uid,
    reviewedAt: releasedAt,
    resultVersions: [
      firstReleaseVersion({
        values: ORIGINAL,
        releasedBy: MANAGER.email,
        releasedByUid: MANAGER.uid,
        releasedAt,
      }),
    ],
    ...overrides,
  };
}

function clone(values: ResultValues): ResultValues {
  return JSON.parse(JSON.stringify(values)) as ResultValues;
}

describe("isReleasedResultStatus", () => {
  it("treats approved and amended as terminal released statuses", () => {
    expect(isReleasedResultStatus("approved")).toBe(true);
    expect(isReleasedResultStatus("amended")).toBe(true);
    expect(isReleasedResultStatus("results_entered")).toBe(false);
    expect(isReleasedResultStatus("pending")).toBe(false);
  });
});

describe("amendmentReasonReady", () => {
  it("requires a listed reason code", () => {
    expect(amendmentReasonReady("too short")).toBe(false);
    expect(amendmentReasonReady("other", "")).toBe(false);
    expect(amendmentReasonReady("other", "tube mix-up")).toBe(true);
    expect(amendmentReasonReady("transcription_error")).toBe(true);
  });
});

describe("startAmendment", () => {
  it("lets a lab supervisor amend a result the lab manager released", () => {
    const result = startAmendment({
      order: approvedOrder(),
      newValues: CORRECTED,
      reason: "transcription_error",
      actor: SUPERVISOR,
      now: "2026-08-21T02:15:00.000Z",
    });
    expect(result.ok).toBe(true);
    if (!result.ok || result.mode !== "applied") throw new Error("expected applied amendment");
    expect(result.newVersion).toBe(2);
    expect(result.previousVersion).toBe(1);
    expect(result.updates.status).toBe("amended");
    expect(result.updates.results).toEqual(CORRECTED);
    const versions = result.updates.resultVersions as { version: number; values: ResultValues }[];
    expect(versions[0].values).toEqual(ORIGINAL);
    expect(versions[1].values).toEqual(CORRECTED);
  });

  it("keeps the original released values retrievable after amendment", () => {
    const result = startAmendment({
      order: approvedOrder(),
      newValues: CORRECTED,
      reason: "transcription_error",
      actor: SUPERVISOR,
      now: "2026-08-21T02:15:00.000Z",
    });
    if (!result.ok || result.mode !== "applied") throw new Error("expected applied amendment");
    const original = originalResultVersion({
      status: "amended",
      results: result.updates.results as ResultValues,
      resultVersions: result.updates.resultVersions,
      reviewedBy: MANAGER.email,
      reviewedByUid: MANAGER.uid,
      reviewedAt: "2026-08-20T09:00:00.000Z",
    });
    expect(original?.version).toBe(1);
    expect(original?.values).toEqual(ORIGINAL);
    expect(original?.releasedBy).toBe(MANAGER.email);
  });

  it("rejects a reason shorter than 20 characters", () => {
    const result = startAmendment({
      order: approvedOrder(),
      newValues: CORRECTED,
      reason: "not_a_code",
      actor: SUPERVISOR,
    });
    expect(result).toEqual({ ok: false, error: AMENDMENT_REASON_MESSAGE });
  });

  it("requires a second approver when the original releaser initiates", () => {
    const result = startAmendment({
      order: approvedOrder(),
      newValues: CORRECTED,
      reason: "transcription_error",
      actor: MANAGER,
      now: "2026-08-21T10:00:00.000Z",
    });
    expect(result.ok).toBe(true);
    if (!result.ok || result.mode !== "pending") throw new Error("expected pending amendment");
    expect(result.updates.status).toBeUndefined();
    expect(result.updates.pendingAmendmentAt).toBe("2026-08-21T10:00:00.000Z");
    expect(result.updates.pendingAmendment).toMatchObject({
      fromVersion: 1,
      initiatedByUid: MANAGER.uid,
      values: CORRECTED,
    });
  });

  it("does not exempt the owner from the second-approver rule", () => {
    const order = approvedOrder({
      reviewedBy: OWNER.email,
      reviewedByUid: OWNER.uid,
      resultVersions: [
        firstReleaseVersion({
          values: ORIGINAL,
          releasedBy: OWNER.email,
          releasedByUid: OWNER.uid,
          releasedAt: "2026-08-20T09:00:00.000Z",
        }),
      ],
    });
    expect(actorIsOriginalReleaser(order, OWNER)).toBe(true);
    const result = startAmendment({
      order,
      newValues: CORRECTED,
      reason: "transcription_error",
      actor: OWNER,
    });
    expect(result.ok && result.mode === "pending").toBe(true);
  });

  it("rejects a no-op amendment", () => {
    const result = startAmendment({
      order: approvedOrder(),
      newValues: ORIGINAL,
      reason: "transcription_error",
      actor: SUPERVISOR,
    });
    expect(result).toEqual({ ok: false, error: AMENDMENT_NO_CHANGE_MESSAGE });
  });

  it("keeps versioning when an already-amended result is amended again", () => {
    const first = startAmendment({
      order: approvedOrder(),
      newValues: CORRECTED,
      reason: "transcription_error",
      actor: SUPERVISOR,
      now: "2026-08-21T02:15:00.000Z",
    });
    if (!first.ok || first.mode !== "applied") throw new Error("expected first amendment");
    const secondValues = { FBC: { Hb: "13.4", WBC: "7.0" } };
    const second = startAmendment({
      order: {
        status: "amended",
        results: first.updates.results as ResultValues,
        resultVersions: first.updates.resultVersions,
        reviewedBy: MANAGER.email,
        reviewedByUid: MANAGER.uid,
        reviewedAt: "2026-08-20T09:00:00.000Z",
      },
      newValues: secondValues,
      reason: "wrong_value",
      actor: SUPERVISOR,
      now: "2026-08-21T03:00:00.000Z",
    });
    expect(second.ok && second.mode === "applied").toBe(true);
    if (!second.ok || second.mode !== "applied") return;
    expect(second.newVersion).toBe(3);
    const versions = second.updates.resultVersions as { version: number; values: ResultValues }[];
    expect(versions.map((row) => row.version)).toEqual([1, 2, 3]);
    expect(versions[0].values).toEqual(ORIGINAL);
    expect(second.updates.status).toBe("amended");
  });
});

describe("confirmAmendment", () => {
  it("applies the pending values only when a different approver confirms", () => {
    const pending = startAmendment({
      order: approvedOrder(),
      newValues: CORRECTED,
      reason: "transcription_error",
      actor: MANAGER,
      now: "2026-08-21T10:00:00.000Z",
    });
    if (!pending.ok || pending.mode !== "pending") throw new Error("expected pending");
    const own = confirmAmendment({
      order: { ...approvedOrder(), pendingAmendment: pending.updates.pendingAmendment },
      confirmer: MANAGER,
    });
    expect(own).toEqual({ ok: false, error: CANNOT_CONFIRM_OWN_AMENDMENT_MESSAGE });

    const confirmed = confirmAmendment({
      order: { ...approvedOrder(), pendingAmendment: pending.updates.pendingAmendment },
      confirmer: SUPERVISOR,
      now: "2026-08-21T10:05:00.000Z",
    });
    expect(confirmed.ok).toBe(true);
    if (!confirmed.ok) return;
    expect(confirmed.previousVersion).toBe(1);
    expect(confirmed.newVersion).toBe(2);
    expect(confirmed.updates.status).toBe("amended");
    expect(confirmed.amender.uid).toBe(MANAGER.uid);
    const versions = confirmed.updates.resultVersions as {
      version: number;
      confirmedBy: string | null;
      amendedBy: string | null;
    }[];
    expect(versions[1].amendedBy).toBe(MANAGER.email);
    expect(versions[1].confirmedBy).toBe(SUPERVISOR.email);
  });
});

describe("changedResultValues", () => {
  it("lists only the parameters that changed, for an amended reprint", () => {
    expect(changedResultValues(ORIGINAL, CORRECTED)).toEqual([
      { testCode: "FBC", parameter: "Hb", previous: "12.0", current: "13.4" },
    ]);
  });
});

describe("countAmendmentsInWindow", () => {
  it("counts amendment versions whose timestamp falls in the period", () => {
    const window = getTimeWindow("today", new Date("2026-08-21T12:00:00.000Z"));
    const inWindow = (iso: string | null | undefined) => isWithin(iso, window);
    const amended = startAmendment({
      order: approvedOrder(),
      newValues: CORRECTED,
      reason: "transcription_error",
      actor: SUPERVISOR,
      now: "2026-08-21T02:15:00.000Z",
    });
    if (!amended.ok || amended.mode !== "applied") throw new Error("expected applied");
    expect(
      countAmendmentsInWindow(
        [
          {
            status: "amended",
            resultVersions: amended.updates.resultVersions,
            lastAmendedAt: "2026-08-21T02:15:00.000Z",
          },
          approvedOrder(),
        ],
        inWindow
      )
    ).toBe(1);
    expect(
      countAmendmentsInWindow(
        [{ status: "amended", resultVersions: amended.updates.resultVersions }],
        (iso) => isWithin(iso, getTimeWindow("yesterday", new Date("2026-08-21T12:00:00.000Z")))
      )
    ).toBe(0);
  });
});

describe("ensureResultVersions", () => {
  it("snapshots a legacy approved order so the original remains retrievable", () => {
    const versions = ensureResultVersions({
      status: "approved",
      results: ORIGINAL,
      reviewedBy: MANAGER.email,
      reviewedByUid: MANAGER.uid,
      reviewedAt: "2026-08-20T09:00:00.000Z",
    });
    expect(versions).toHaveLength(1);
    expect(versions[0].values).toEqual(ORIGINAL);
    expect(versions[0].releasedByUid).toBe(MANAGER.uid);
  });
});

describe("amendmentBlockedOffline", () => {
  it("matches release: amendment is unavailable while offline", () => {
    expect(amendmentBlockedOffline(false)).toBe(true);
    expect(amendmentBlockedOffline(true)).toBe(false);
  });
});

describe("amendmentAuditDetail", () => {
  it("records the reason, both version identifiers, and confirming approver", () => {
    expect(
      amendmentAuditDetail({
        reason: "transcription_error",
        previousVersion: 1,
        newVersion: 2,
        amender: SUPERVISOR,
        confirmer: MANAGER,
        secondApprover: true,
      })
    ).toMatchObject({
      reason: "transcription_error",
      previousVersion: 1,
      newVersion: 2,
      confirmedBy: MANAGER.email,
      secondApprover: true,
    });
  });
});
