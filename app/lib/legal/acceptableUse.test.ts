import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ACCEPTABLE_USE,
  compareTermsVersions,
  formatTermsDocument,
  isAcceptedTermsCurrent,
} from "./acceptableUse";

const EXPECTED_DOCUMENT = `LabFlow — Acceptable Use

Version 1.0 · Effective 4 September 2026
For everyone who signs in to LabFlow at a clinic.

The records in this system are confidential medical information about real people. Gambian law places duties on your clinic that, in practice, only the people using this system can meet. These terms say what those duties mean at your desk.

Please read them. They are short on purpose.

1. Open only the records your work requires.
You may open a patient's record when you are registering them, handling their sample, entering or checking their result, or answering a question about their care. Looking up a relative, a neighbour, a colleague or a public figure out of curiosity is not permitted, even if you tell no one and change nothing.

2. Your account is you.
Your sign-in and your PIN identify you personally. Do not share them, do not let another person work under your session, and do not work under anyone else's. Every result released under your name is a result you are answerable for.

3. Everything you do is recorded.
Each record you open, create, change, release, amend, print or export is logged against your name and the time. These logs cannot be edited or deleted by anyone, including the clinic administrator and including LabFlow. This is deliberate: it protects patients, and it protects you when you have done your job correctly.

4. Results stay inside the laboratory.
Do not discuss a patient's results outside your work, including with the patient's family, unless your clinic's procedure says you may. Do not photograph the screen, and do not copy patient information into your phone, a personal email account, or a messaging application.

5. Look after the device you work on.
Lock LabFlow when you step away — it also locks itself. Do not sign in on a device that other people use for other purposes. If a device with LabFlow on it is lost or stolen, tell your manager the same day.

6. A printed report is a patient record.
Collect it from the printer straight away. Do not leave reports on a desk, a bench or a shared tray. Hand a report only to the patient, to a clinician treating them, or to a person your clinic's procedure allows. Dispose of spoiled copies so they cannot be read.

7. Release only what you have checked.
Do not release a result you have not verified against the sample and the request. If something does not look right — the value, the sample, the patient's identity — stop and ask. A result released is a result acted on.

8. Corrections are made in the system, never over the top of it.
If a released result was wrong, use the amendment process. Do not overwrite, delete or re-enter it to hide the earlier value. The original stays, the correction is recorded, and both are visible. That is how a laboratory shows its work.

9. Working outside your rostered hours.
If you need to work outside your roster, the system will let you, and it will ask you why. Give the real reason. These sessions are reported to your manager as a matter of routine — they are not accusations, and covering an absent colleague is a perfectly good answer.

10. Tell someone the same day if something goes wrong.
If you think a record has been seen by the wrong person, a device or report has been lost, a password or PIN has been shared, or anything else has gone wrong with patient information — tell your manager **before you go home**. The clinic has a legal duty to report certain incidents **within 72 hours**, and that clock starts when the clinic becomes aware. A delay of a day can turn a manageable problem into a reportable failure.

11. Who else can see this data.
Your clinic controls its own records. Staff at other clinics using LabFlow cannot see them. LabFlow's operator can access records where it is necessary to support the system or investigate a safety or security problem, and that access is logged in exactly the same way as yours.

12. When you leave.
Your access ends when your employment or engagement ends. Do not keep copies of patient information in any form. Your duty of confidentiality does not end with your job.

13. If these terms are broken.
Access may be suspended or withdrawn. Depending on what happened, your clinic may also take disciplinary action, and some breaches of patient confidentiality are matters for the law.

Questions about these terms go to your clinic administrator.`;

const RULES = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "firestore.rules"),
  "utf8"
);

describe("ACCEPTABLE_USE", () => {
  it("is versioned in the repo with a re-acceptance changelog sentence", () => {
    expect(ACCEPTABLE_USE.id).toBe("acceptable-use");
    expect(ACCEPTABLE_USE.version).toBe("1.0");
    expect(ACCEPTABLE_USE.effectiveFrom).toBe("2026-09-04");
    expect(ACCEPTABLE_USE.title).toBe("LabFlow — Acceptable Use");
    expect(ACCEPTABLE_USE.whatChanged).toBe(
      "First publication of the clinic staff acceptable-use terms."
    );
    expect(ACCEPTABLE_USE.body.clauses).toHaveLength(13);
  });

  it("serializes to the drafted document wording", () => {
    expect(formatTermsDocument()).toBe(EXPECTED_DOCUMENT);
  });

  it("is not stored as a Firestore collection in this module", () => {
    expect(RULES).toContain("match /termsAcceptances/{id}");
    expect(JSON.stringify(ACCEPTABLE_USE)).not.toContain("termsAcceptances/");
  });
});

describe("compareTermsVersions", () => {
  it("orders dotted numeric versions so a later publication is visible", () => {
    expect(compareTermsVersions("1.0", "1.0")).toBe(0);
    expect(compareTermsVersions("1.0", "1.1")).toBeLessThan(0);
    expect(compareTermsVersions("1.1", "1.0")).toBeGreaterThan(0);
    expect(compareTermsVersions("1.9", "1.10")).toBeLessThan(0);
    expect(compareTermsVersions("2.0", "1.9")).toBeGreaterThan(0);
    expect(isAcceptedTermsCurrent("1.0", "1.0")).toBe(true);
    expect(isAcceptedTermsCurrent("1.0", ACCEPTABLE_USE.version)).toBe(true);
    expect(isAcceptedTermsCurrent("1.0", "1.1")).toBe(false);
  });
});
