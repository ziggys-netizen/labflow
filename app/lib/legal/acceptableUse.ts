/**
 * Clinic staff acceptable-use terms. Versioned in the repository — not Firestore.
 * F2 will show this text and record re-acceptance when `version` / `whatChanged`
 * move forward.
 */

export type TermsClause = {
  number: number;
  title: string;
  body: string;
};

export type TermsBody = {
  versionLine: string;
  audience: string;
  intro: readonly string[];
  clauses: readonly TermsClause[];
  closing: string;
};

export const ACCEPTABLE_USE = {
  id: "acceptable-use",
  version: "1.0",
  effectiveFrom: "2026-09-04",
  title: "LabFlow — Acceptable Use",
  whatChanged: "First publication of the clinic staff acceptable-use terms.",
  body: {
    versionLine: "Version 1.0 · Effective 4 September 2026",
    audience: "For everyone who signs in to LabFlow at a clinic.",
    intro: [
      "The records in this system are confidential medical information about real people. Gambian law places duties on your clinic that, in practice, only the people using this system can meet. These terms say what those duties mean at your desk.",
      "Please read them. They are short on purpose.",
    ],
    clauses: [
      {
        number: 1,
        title: "Open only the records your work requires.",
        body: "You may open a patient's record when you are registering them, handling their sample, entering or checking their result, or answering a question about their care. Looking up a relative, a neighbour, a colleague or a public figure out of curiosity is not permitted, even if you tell no one and change nothing.",
      },
      {
        number: 2,
        title: "Your account is you.",
        body: "Your sign-in and your PIN identify you personally. Do not share them, do not let another person work under your session, and do not work under anyone else's. Every result released under your name is a result you are answerable for.",
      },
      {
        number: 3,
        title: "Everything you do is recorded.",
        body: "Each record you open, create, change, release, amend, print or export is logged against your name and the time. These logs cannot be edited or deleted by anyone, including the clinic administrator and including LabFlow. This is deliberate: it protects patients, and it protects you when you have done your job correctly.",
      },
      {
        number: 4,
        title: "Results stay inside the laboratory.",
        body: "Do not discuss a patient's results outside your work, including with the patient's family, unless your clinic's procedure says you may. Do not photograph the screen, and do not copy patient information into your phone, a personal email account, or a messaging application.",
      },
      {
        number: 5,
        title: "Look after the device you work on.",
        body: "Lock LabFlow when you step away — it also locks itself. Do not sign in on a device that other people use for other purposes. If a device with LabFlow on it is lost or stolen, tell your manager the same day.",
      },
      {
        number: 6,
        title: "A printed report is a patient record.",
        body: "Collect it from the printer straight away. Do not leave reports on a desk, a bench or a shared tray. Hand a report only to the patient, to a clinician treating them, or to a person your clinic's procedure allows. Dispose of spoiled copies so they cannot be read.",
      },
      {
        number: 7,
        title: "Release only what you have checked.",
        body: "Do not release a result you have not verified against the sample and the request. If something does not look right — the value, the sample, the patient's identity — stop and ask. A result released is a result acted on.",
      },
      {
        number: 8,
        title: "Corrections are made in the system, never over the top of it.",
        body: "If a released result was wrong, use the amendment process. Do not overwrite, delete or re-enter it to hide the earlier value. The original stays, the correction is recorded, and both are visible. That is how a laboratory shows its work.",
      },
      {
        number: 9,
        title: "Working outside your rostered hours.",
        body: "If you need to work outside your roster, the system will let you, and it will ask you why. Give the real reason. These sessions are reported to your manager as a matter of routine — they are not accusations, and covering an absent colleague is a perfectly good answer.",
      },
      {
        number: 10,
        title: "Tell someone the same day if something goes wrong.",
        body: "If you think a record has been seen by the wrong person, a device or report has been lost, a password or PIN has been shared, or anything else has gone wrong with patient information — tell your manager **before you go home**. The clinic has a legal duty to report certain incidents **within 72 hours**, and that clock starts when the clinic becomes aware. A delay of a day can turn a manageable problem into a reportable failure.",
      },
      {
        number: 11,
        title: "Who else can see this data.",
        body: "Your clinic controls its own records. Staff at other clinics using LabFlow cannot see them. LabFlow's operator can access records where it is necessary to support the system or investigate a safety or security problem, and that access is logged in exactly the same way as yours.",
      },
      {
        number: 12,
        title: "When you leave.",
        body: "Your access ends when your employment or engagement ends. Do not keep copies of patient information in any form. Your duty of confidentiality does not end with your job.",
      },
      {
        number: 13,
        title: "If these terms are broken.",
        body: "Access may be suspended or withdrawn. Depending on what happened, your clinic may also take disciplinary action, and some breaches of patient confidentiality are matters for the law.",
      },
    ],
    closing: "Questions about these terms go to your clinic administrator.",
  },
} as const;

export type AcceptableUseDocument = typeof ACCEPTABLE_USE;

/** Visible document text — headings and clauses 1–13, wording unchanged. */
export function formatTermsDocument(document: AcceptableUseDocument = ACCEPTABLE_USE): string {
  const { body } = document;
  const intro = body.intro.join("\n\n");
  const clauses = body.clauses
    .map((clause) => `${clause.number}. ${clause.title}\n${clause.body}`)
    .join("\n\n");
  return [
    document.title,
    "",
    body.versionLine,
    body.audience,
    "",
    intro,
    "",
    clauses,
    "",
    body.closing,
  ].join("\n");
}

function versionParts(version: string): number[] {
  return version.split(".").map((part) => {
    const n = Number.parseInt(part, 10);
    return Number.isFinite(n) ? n : 0;
  });
}

/** Dotted numeric compare: "1.0" < "1.1" < "1.10" < "2.0". */
export function compareTermsVersions(a: string, b: string): number {
  const left = versionParts(a);
  const right = versionParts(b);
  const len = Math.max(left.length, right.length);
  for (let i = 0; i < len; i++) {
    const na = left[i] ?? 0;
    const nb = right[i] ?? 0;
    if (na !== nb) return na < nb ? -1 : 1;
  }
  return 0;
}

export function isAcceptedTermsCurrent(acceptedVersion: string, currentVersion: string): boolean {
  return compareTermsVersions(acceptedVersion, currentVersion) >= 0;
}
