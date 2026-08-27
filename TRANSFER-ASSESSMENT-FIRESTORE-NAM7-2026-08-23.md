# Cross-Border Transfer Assessment — Brief for Legal Review

**Prepared:** 23 August 2026  
**For:** Gambian counsel, on the Personal Data Protection and Privacy Act 2025 (Bill as passed, National Assembly)  
**Subject:** whether LabFlow may lawfully store Gambian patient data in Google Firestore's `nam7` United States multi-region  
**Product record:** `app/lib/transferAssessments.ts` (`id: firestore-nam7`)

> **This is a research brief, not legal advice.** It sets out the facts and the material a controller would rely on, so that counsel's time goes to judgement rather than fact-gathering.

**`receivingCountryLawAssessment` stored in the product record:** `PENDING LEGAL REVIEW`  
Do not replace that field with a machine-generated conclusion. Counsel's wording replaces it verbatim when it arrives.

---

## 1. The decision this brief supports

**Decided 23 August 2026:** LabFlow remains on the existing Firebase project in `nam7` and seeks legal advice on the transfer question, rather than pre-emptively rebuilding in a European region.

**Recorded consequence:** no real patient data enters the system until this question is answered. The decision is revisited if the answer is unfavourable, and §7 below sets the point at which reversal stops being cheap.

---

## 2. The facts

| Item | Value |
|---|---|
| Controller | Each clinic, in respect of its own patients |
| Processor | LabFlow (Isaac Kanu), operating the platform |
| Sub-processors | Google LLC (Firestore, Firebase Authentication), Vercel Inc. (application hosting and server routes), Resend (transactional email, not yet configured) |
| **Firestore location** | **`nam7` — Iowa, Northern Virginia, Oklahoma (United States multi-region)** |
| **Vercel function region** | **`fra1` — Frankfurt, Germany (EU)** |
| Firebase project | `labflow-6cb9e`, created 8 August 2026 |
| Data at present | 6 patients, 6 orders, 3 clinics, 5 users — **all invented test data, no real person** |
| Encryption at rest | Google-managed keys, enabled by default |
| Scheduled backups | **Disabled** — a separate finding, see §8 |
| Data categories | Patient identifiers and health data. Health is a **special category** under s.2 |

---

## 3. The statutory framework

**Part VII of the Act is a single section, s.37.**

> **s.37(1)** — *"Cross-border transfers of personal data to other countries or international organisations are permitted when an appropriate level of protection is ensured, for legitimate purposes, and with mutual benefit to both jurisdictions and can be achieved through –*
> *(a) the law of the receiving country or international organisation, **including adherence to applicable international treaties or agreements**; or*
> *(b) ad hoc or standardised safeguards provided by legally binding and enforceable instruments **adopted by the Commission** and implemented by those involved in the transfer and further processing of personal data."*

Supporting provisions: **s.37(2)** the controller assesses the level of protection; **s.37(3)** *"The Commission must be involved in assessing whether the criteria for cross-border transfers are met"*; **s.37(4)** the assessment must be documented; **s.37(5)** produced to the Commission on request, which may demand demonstration of effectiveness; **s.37(6)** the Commission may prohibit, suspend or impose conditions.

**Three features that shape the question:**

1. **There is no derogation.** No consent, no contractual necessity, no vital interests, no legal claims. **No equivalent of GDPR Article 49.** A controller satisfying neither limb has no lawful route at all
2. **Limb (b) is presently unavailable.** It depends on instruments *adopted by the Commission*, and the Commission appears to have adopted none. Executing EU standard contractual clauses does not engage this limb — the instrument must be Commission-adopted
3. **"Mutual benefit to both jurisdictions"** sits in the chapeau and applies to both limbs. It is undefined and untested, with no analogue in GDPR or Convention 108+

**No data localisation requirement exists anywhere in the Act.** Offshore hosting is regulated, not prohibited.

---

## 4. The material a controller would rely on under s.37(1)(a)

The United States has no comprehensive federal data protection statute. The argument therefore rests on the second half of limb (a) — *"including adherence to applicable international treaties or agreements"* — and on the recipient's own binding commitments.

**Verified from primary sources:**

| Fact | Source |
|---|---|
| **Google LLC and its wholly-owned US subsidiaries are certified under the EU–U.S. Data Privacy Framework, the Swiss–U.S. DPF and the UK Extension** | [Google — Data transfer frameworks](https://policies.google.com/privacy/frameworks?hl=en-US) |
| Google's Cloud Data Processing Addendum **incorporates European Commission Standard Contractual Clauses** — controller-to-processor, processor-to-processor, and processor-to-controller variants | [Cloud Data Processing Addendum](https://cloud.google.com/terms/data-processing-addendum/index-20240409) §4.1 |
| Google commits to maintaining **ISO/IEC 27001, ISO/IEC 27017, ISO/IEC 27018** and PCI DSS for Google Cloud Platform, plus **SOC 2 and SOC 3** reports audited at least every 12 months | Same, §7.4 and Appendix 4 |
| **Encryption at rest and in transit** is a contractual security measure, with TLS and perfect forward secrecy for transmission | Same, §7.1.1 and Appendix 2 |

**ISO/IEC 27018 is worth noting specifically** — it is the standard for protection of personally identifiable information in public clouds, and is the closest thing to a privacy-specific certification in the set.

**The shape of the argument, for counsel to accept, refine or reject:**

> The EU–U.S. Data Privacy Framework is an arrangement recognised by the European Commission as providing adequate protection for personal data transferred to certified US organisations. Google LLC is certified under it. Google is additionally bound by European Commission Standard Contractual Clauses under its Data Processing Addendum, holds ISO/IEC 27018, and contractually commits to encryption at rest and in transit. A Gambian controller might therefore argue that transfer to Google's US infrastructure satisfies s.37(1)(a) by reference to *"adherence to applicable international treaties or agreements"*, notwithstanding the absence of a comprehensive US federal statute.

**The obvious counter-arguments**, stated so counsel does not have to find them:

- The DPF is an EU–US instrument. The Gambia is not a party to it, and s.37(1)(a) may be read to require protection assessable from a Gambian standpoint rather than borrowed from a third jurisdiction's adequacy finding
- The DPF has been subject to litigation risk in the EU, and its predecessors (Safe Harbor, Privacy Shield) were both invalidated
- SCCs are an EU-law instrument; s.37(1)(b) requires **Commission-adopted** instruments, and it is arguable that reliance on EU SCCs is an attempt to use limb (b) through limb (a)
- *"Mutual benefit to both jurisdictions"* is unaddressed by any of the above

---

## 5. The questions for counsel

1. **Does storage of Gambian patient data in Google's `nam7` US multi-region satisfy s.37(1)(a)?** If yes, what must the s.37(2) assessment record to be defensible under s.37(5)?
2. **If not**, does relocation to a European multi-region (`eur3`) resolve it — GDPR being the receiving law — or does something further remain?
3. **Does s.37(3)** — *"The Commission must be involved in assessing whether the criteria are met"* — require engagement with the Information Commission **before** transfers begin, or does it describe the Commission's supervisory role after the fact?
4. **What does *"mutual benefit to both jurisdictions"* require**, and how is it evidenced?
5. **Is the Act in force?** The National Assembly bill tracker records the stage as "Assented"; the assent date and commencement date are not established. Is there a transition period for existing controllers?
6. **Does the split arrangement matter** — application compute in Frankfurt, database in the US? Is the transfer assessed at the point of storage, or at each processing location?

---

## 6. Questions beyond the transfer point, worth covering in the same conversation

7. **Lawful basis.** LabFlow now relies on **s.5(2)(b) or (f)** plus **s.6(1)(c)** *"necessary in the management of health services… subject to professional secrecy and conditions provided for by law"*, rather than patient consent — on the reading that **s.8(9)** invalidates consent a patient cannot refuse without losing their test. Is that pairing correct for a private clinic? For a public one, given **s.5(3)** excludes legitimate interests from public authorities? And what does *"conditions provided for by law"* currently import?
8. **Retention.** The Act names no period, and no Gambian health regulation specifying clinical-record retention was found. What is defensible, per record class — results, quality records, paediatric records?
9. **Erasure.** s.10 has no medical-records carve-out, unlike GDPR Art. 17(3), and s.36 permits exceptions *"only when provided for by law"* — with no Gambian retention statute to point to. On a patient erasure request, what must be removed and what may be retained?
10. **DPO.** s.34 makes a Data Protection Officer mandatory in three defined circumstances. Does a LabFlow deployment trigger any of them, and does the obligation fall on the clinic, on LabFlow, or both?
11. **A drafting flag.** In the Bill text, **s.10(3)(c)** refers to objection *"based on section 6(1)(e) or (f)"*, but public-task and legitimate-interest bases sit at **s.5(2)(e) and (f)**; s.6(1)(e)/(f) are vital interests and national security. This appears to be an un-renumbered cross-reference carried from GDPR Art. 6(1)(e)/(f). **Does the gazetted Act carry the same text?**

---

## 7. The tripwire

Reversal cost rises with data volume and time, and the decision to stay should be revisited at whichever of these comes first:

| Trigger | Why |
|---|---|
| **Counsel advises the US position does not hold** | Migrate immediately, before real data |
| **Before the first real patient record is entered** | This is the hard gate. Migration with test data is an afternoon; with live clinical records it is a project |
| **A second clinic goes live with real data** | Two tenants multiply the migration surface |
| **90 days from today — 21 November 2026** | If counsel has not been engaged by then, the decision has become drift rather than a decision |

**The present position is deliberately cheap to reverse:** 6 test patients, 3 clinics, 5 users, a project two weeks old, still on trial credit. That is the best it will ever be.

---

## 8. A separate finding, unrelated to transfers

**Scheduled backups on the Firestore database are Disabled.**

This is a clinical database with no backup. SLIPTA §9 requires backup procedures and LIS downtime records; ISO 15189:2022 clause 7.8 requires continuity planning with tested response capability. **Enable point-in-time recovery and scheduled backups regardless of the outcome of this brief** — and if the project is later relocated, enable them on the new one from the start.

This finding is stored on the product record as `scheduledBackups` / `scheduledBackupsFinding`. It is not part of `receivingCountryLawAssessment`.

---

## 9. What this becomes in the product

This brief seeds the `transferAssessments` record for the Firestore destination. **W2** (the work item that was to specify the Firestore collection path and field schema) is **not in this repository**. The fallback is the deployment-level typed seed in `app/lib/transferAssessments.ts`, keyed `firestore-nam7`.

| Field | Value stored |
|---|---|
| Factual fields | Populated from §2 (controller, processor, sub-processors, regions, project, data at present, encryption) |
| `legalBasisLimb` | `s.37(1)(a)` |
| `legalGateway` | `pending` — the product does not pick adequacy / SCC / other |
| **`receivingCountryLawAssessment`** | **`PENDING LEGAL REVIEW`** — replaced verbatim with counsel's conclusion when it arrives |
| `reviewer` | `null` until counsel |
| `reviewDueAt` | `2027-08-23` |
| `reviewDueRule` | annual, or on any change of sub-processor or region |
| `counselEngagementTripwireAt` | `2026-11-21` |
| `hardGate` | No real patient data until counsel answers |

Do not have a model draft the assessment conclusion. A machine-generated legal conclusion stored as though it were one is worse than an empty field, because it reads as answered.

Vercel `fra1` and Resend are listed as known destinations in the same module. They are **not** assessed by this brief.

No document was written to live Firestore. Production rules were unverified as of the 22 August 2026 census; a client write of a legal record into an open database would not be a retrievable controller record.

---

## Sources

- Personal Data Protection and Privacy Bill 2025, National Assembly of The Gambia — [assembly.gm](https://assembly.gm/)
- [Google — Data transfer frameworks](https://policies.google.com/privacy/frameworks?hl=en-US)
- [Google Cloud Data Processing Addendum](https://cloud.google.com/terms/data-processing-addendum/index-20240409)
- [European Commission — Adequacy decisions](https://commission.europa.eu/law/law-topic/data-protection/international-dimension-data-protection/adequacy-decisions_en)
- [ASLM SLIPTA Checklist V3:2023](https://aslm.org/wp-content/uploads/2019/12/SLIPTA-Checklist-V3-22-Dec-2023.pdf) — [ISO 15189:2022](https://www.iso.org/standard/76677.html)
