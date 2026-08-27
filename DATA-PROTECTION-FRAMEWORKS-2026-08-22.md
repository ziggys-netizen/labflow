# Data Protection and Health-Records Frameworks for a Gambian Clinical Laboratory Product

Research date: 22 August 2026. Every factual claim below is tied to a source in the Sources section. Where I could not verify something from a primary or credible secondary source, it is marked **not established** rather than inferred.

**Operative product constraints for The Gambia are in [`docs/LabFlow-PRD-v0.5.md`](docs/LabFlow-PRD-v0.5.md) §12**, rewritten from the National Assembly Bill PDF and tightened 23 August 2026. This file remains the regional/international research note. **Where this file's Gambia MUST items conflict with §12, §12 wins** — in particular: regulator identity (Information Commission under the ATI Act 2021, s.38 of the Bill), Bill-PDF vs enacted Gazette text, commencement not established, no localisation, no controller registration today (watch s.45), and no penalty figures.

---

## A. West African / African regional instruments

### A1. ECOWAS Supplementary Act A/SA.1/01/10 on Personal Data Protection

**Adoption and status.** Adopted February 2010. It obliges member states to "establish national legal frameworks for the protection of privacy of data relating to the collection, processing, transmission, storage, and use of personal data" and to "create national data protection authorities, responsible for ensuring that personal data is processed in compliance with legal provisions" ([Digital Watch Observatory](https://dig.watch/resource/suplementary-act-personal-data-protection-within-ecowas)).

**Direct applicability vs domestication — the sources partially diverge, so read this carefully:**

- The Future of Privacy Forum's 2024 report on African regional economic communities states the Act is binding and "subsequently became a core feature of the ECOWAS Treaty system, making violations of the Act enforceable against member states through the ECOWAS Court of Justice" ([FPF, *Towards a Continental Approach to Data Protection in Africa*](https://fpf.org/wp-content/uploads/2024/02/Africa-RECs-Report-.pdf)).
- A working paper describes it as "directly applicable and binding in all member states without the need for further domestic ratification," entering into force upon publication in national official journals ([Academia.edu, *African Bodies: ECOWAS and data protection*](https://www.academia.edu/144438302/African_Bodies_ECOWAS_and_data_protection)). This is an unrefereed source — treat the "no domestication needed" framing as **weakly established**.
- In operational practice, INTERPOL's WAPIS data-protection guide records that member states "must enact data protection legislation and establish adequate data protection authorities," and flags "the lack of data protection legislation and non-existence of data protection authorities in some WAPIS participating countries," recommending as an interim measure that such countries publish the Act in their official journals and respect its principles ([INTERPOL/WAPIS Best Practice Guide](https://www.interpol.int/content/download/16379/file/20COM0370-%20WAPIS_Best%20Practice%20Guide%20on%20data%20protection_EN_04_LRchapter_Optimized.pdf)).

**Practical reading:** the Act binds states at ECOWAS level, but compliance in practice has run through national law, and national implementation is uneven. FPF notes "more than half of the member states in ECOWAS have since passed their own national data protection laws with Nigeria being the latest," and that this has "hampered regional harmonization" ([FPF](https://fpf.org/wp-content/uploads/2024/02/Africa-RECs-Report-.pdf)).

**Which states are bound.** The Act applies to ECOWAS member states. ECOWAS membership changed materially in 2025: Burkina Faso, Mali and Niger's withdrawal took effect **29 January 2025**, reducing ECOWAS from 15 to **12 member states** ([ECOWAS official statement](https://www.ecowas.int/burkina-faso-mali-and-nigers-withdrawal-from-ecowas-is-now-a-reality/)). The remaining 12 include The Gambia, Ghana, Nigeria and Senegal ([FPF list of the pre-withdrawal 15](https://fpf.org/wp-content/uploads/2024/02/Africa-RECs-Report-.pdf)).

**Sensitive and health data — Article 30.** The Act addresses "processing of sensitive personal data (Article 30)" ([FPF](https://fpf.org/wp-content/uploads/2024/02/Africa-RECs-Report-.pdf)). The category expressly includes health: personal data "revealing the racial, ethnic or regional origin … religious … beliefs … sexual life, genetic data or … state of health" may not be processed except when "strictly necessary," with explicit legal authorisation, or to protect vital interests ([INTERPOL/WAPIS](https://www.interpol.int/content/download/16379/file/20COM0370-%20WAPIS_Best%20Practice%20Guide%20on%20data%20protection_EN_04_LRchapter_Optimized.pdf)).

**Cross-border transfer — Article 36.** "The Act establishes an adequacy requirement for transfers of personal data to non-ECOWAS members (unless specific conditions are met) **and an obligation for controllers to notify the DPA of such transfers** (Article 36)" ([FPF](https://fpf.org/wp-content/uploads/2024/02/Africa-RECs-Report-.pdf)). The notification obligation is the operationally distinctive part — it is a filing duty, not just a standard.

The exact enumerated list of "specific conditions" in Article 36 is **not established** — I could not retrieve a machine-readable full text of the Act (AfricanLII, GhaLII, ICT Policy Africa and Statewatch all failed to serve the article text).

**Revision in progress.** ECOWAS has been revising the Act since 2024 (workshop in Abuja 15–18 July 2024; online review of the preliminary draft 21 October 2024), supported by the EU and Germany's BMZ, to align with the AU Data Policy Framework ([RAO Support Cell ECOWAS](https://www.raosupportcellecowas.com/post/ecowas-online-workshop-on-the-review-of-the-preliminary-draft-of-the-revised-supplementary-act-a-sa)). Whether a revised Act has been adopted as of August 2026 is **not established**.

---

### A2. AU Convention on Cyber Security and Personal Data Protection (Malabo Convention)

**Dates.** Adopted **27 June 2014** ([African Union treaty page](https://au.int/en/treaties/african-union-convention-cyber-security-and-personal-data-protection)). Entered into force **8 June 2023**, thirty days after Mauritania deposited the fifteenth ratification on 9 May 2023 ([EJIL:Talk!](https://www.ejiltalk.org/the-african-unions-malabo-convention-on-cyber-security-and-personal-data-protection-enters-into-force-nearly-after-a-decade-what-does-it-mean-for-data-privacy-in-africa-or-beyond/)).

**Ratification count.** The AU's official status list, dated **02/02/2026**, records **21 signatures and 20 ratifications/accessions (20 deposited)** ([AU status list PDF](https://au.int/sites/default/files/treaties/29560-sl-AFRICAN_UNION_CONVENTION_ON_CYBER_SECURITY_AND_PERSONAL_DATA_PROTECTION_0.pdf)).

**West African ratifiers** (per that same AU status list):

| State | Signed | Ratified | Deposited |
|---|---|---|---|
| Benin | 28/01/2015 | 14/05/2024 | 12/11/2024 |
| Cabo Verde | — | 13/11/2020 | 05/02/2022 |
| Côte d'Ivoire | — | 08/03/2023 | 03/04/2023 |
| Ghana | 04/07/2017 | 13/05/2019 | 03/06/2019 |
| Guinea | — | 31/07/2018 | 16/10/2018 |
| Niger | — | 22/02/2022 | 16/03/2022 |
| Senegal | — | 03/08/2016 | 16/08/2016 |
| Togo | 02/04/2019 | 30/09/2021 | 19/10/2021 |
| **The Gambia** | **02/12/2022** | **not ratified** | — |
| **Nigeria** | **23/01/2024** | **not ratified** | — |
| Guinea-Bissau | 31/01/2015 | not ratified | — |
| Sierra Leone | 29/01/2016 | not ratified | — |
| Burkina Faso, Liberia, Mali | — | — | — |

**Discrepancy flagged:** Wikipedia lists Nigeria among ratifying states and gives a total of 16 ([Wikipedia](https://en.wikipedia.org/wiki/Malabo_Convention)). The AU's own status list contradicts this on both counts. I treat the AU status list as authoritative. Independently, dataprotection.africa confirms **The Gambia has not ratified the Malabo Convention** ([Data Protection Africa — The Gambia](https://dataprotection.africa/the-gambia/)).

**Transfers.** "Controllers may not transfer personal data to a non-member state of the AU. Controllers can only transfer personal data to a non-member state if the country has an adequate level of protection" ([Michalsons](https://www.michalsons.com/blog/au-convention-on-cyber-security-and-personal-data-protection-malabo-convention/65281)). FPF confirms the Convention "prohibits the flow of data outside AU territories without adequate protection," while noting it "has no similar requirement for protection between member states" ([FPF](https://fpf.org/wp-content/uploads/2024/02/Africa-RECs-Report-.pdf)). CIPIT adds that cross-border transfer is permitted where the data subject has consented, where necessary for contract performance or public interest, or where the receiving country maintains adequate protection ([CIPIT](https://cipit.strathmore.edu/the-african-union-convention-on-cyber-security-and-personal-data-protection-key-insights/)).

**Health data.** Article 14 of the Convention "establishes specific principles for processing sensitive data," but the source that identifies this does not set out the health-specific text ([EJIL:Talk!](https://www.ejiltalk.org/the-african-unions-malabo-convention-on-cyber-security-and-personal-data-protection-enters-into-force-nearly-after-a-decade-what-does-it-mean-for-data-privacy-in-africa-or-beyond/)). **The exact Malabo Convention wording on health data is not established** — the AU's own English treaty PDF is a scan with no machine-readable text.

**Member state obligations.** States must develop legal and institutional frameworks, "establish data protection authorities as independent bodies," ensure lawful, fair and transparent processing, and enact domestic legislation ([CIPIT](https://cipit.strathmore.edu/the-african-union-convention-on-cyber-security-and-personal-data-protection-key-insights/)).

**Conflict of laws.** FPF notes "there is little legal certainty of what would happen in the event of a conflict between the Convention and a regional framework, such as ECOWAS' Supplementary Act" ([FPF](https://fpf.org/wp-content/uploads/2024/02/Africa-RECs-Report-.pdf)).

---

### A3. Nigeria Data Protection Act 2023 — the regional benchmark

**Cross-border transfer — the three-section structure:**

- **Section 41** — general prohibition with two gateways: "A data controller … shall not transfer personal data from Nigeria to another country, unless — (a) recipient is subject to law … that affords adequate protection … or (b) one of the conditions set out in section 43 … applies."
- **Section 42 (adequacy)** — protection is adequate if it "upholds principles substantially similar to the conditions for processing … provided for in this Act." FPF's analysis confirms adequacy can be satisfied through the recipient being subject to adequate law, **Binding Corporate Rules, contractual clauses, Codes of Conduct, or certification mechanisms**, and that the Commission issues adequacy guidelines and "can recognize decisions from other jurisdictions meeting equivalent criteria."
- **Section 43 (other bases)** — consent, contract performance, vital interests, legal obligations, public task performance, and legitimate interests that do not override fundamental rights.

Sources: [NDPA 2023 full text via DataGuidance](https://www.dataguidance.com/sites/default/files/data_protection_act_2023.pdf); [Future of Privacy Forum](https://fpf.org/blog/nigerias-new-data-protection-act-explained/).

**How Nigeria handles transfers to the US/EU.** There is no US- or EU-specific carve-out. Both are handled by the same neutral s.41/42/43 test: either the recipient is subject to adequate law or is covered by BCRs/contractual clauses/codes/certification, or one of the s.43 conditions applies. **Whether the NDPC has published an operative adequacy "whitelist" naming the US or EU is not established** from the sources I could retrieve.

**Health data.** "Sensitive personal data" is defined in the interpretation section to include health, genetic and biometric data, race, religion, sex life, political opinions and trade union membership. Section 30 prohibits processing unless the data subject has given and not withdrawn consent, or processing is necessary for performance of obligations, or to protect vital interests ([NDPA text](https://www.dataguidance.com/sites/default/files/data_protection_act_2023.pdf)). FPF notes s.30(2) lets the Commission expand the sensitive categories, and that a "substantial public interest" basis makes the Nigerian regime "notably broader than GDPR restrictions" ([FPF](https://fpf.org/blog/nigerias-new-data-protection-act-explained/)).

**Local hosting.** **No.** The Act contains no explicit requirement mandating personal data storage or hosting within Nigeria ([NDPA text](https://www.dataguidance.com/sites/default/files/data_protection_act_2023.pdf)). But FPF flags that s.43 empowers the Commission to designate categories of personal data warranting additional transfer restrictions, "enabling future localization requirements," and that the National Assembly must approve international cross-border transfer codes and certification mechanisms ([FPF](https://fpf.org/blog/nigerias-new-data-protection-act-explained/)).

**Breach notification.** Section 40: within **72 hours** of becoming aware, notify the Commission where the breach is likely to result in high risk to rights and freedoms; notify data subjects "without undue delay" ([NDPA text](https://www.dataguidance.com/sites/default/files/data_protection_act_2023.pdf), [FPF](https://fpf.org/blog/nigerias-new-data-protection-act-explained/)).

**The GAID 2025 — operationally the more important document.** The NDPC adopted the General Application and Implementation Directive (NDPC/NDP ACT-GAID/01/2025), including a cross-border data transfer regulation ([Digital Policy Alert](https://digitalpolicyalert.org/event/28383-nigeria-data-protection-act-2023-general-application-and-implementation-directive-2025-ndpcndp-act-gaid012025-including-cross-border-data-transfer-regulation-was-adopted-by-nigeria-data-protection-commission)). From the NDPC's published text ([NDP-ACT-GAID-2025](https://ndpc.gov.ng/wp-content/uploads/2025/07/NDP-ACT-GAID-2025-MARCH-20TH.pdf)):

- Article 45 and Schedule 5 govern cross-border transfer.
- **Article 28(3)(o): a DPIA is mandatory for cross-border data transfer.**
- **Article 28(3)(i): a DPIA is mandatory for processing involving "health care services."** For a clinical lab product serving Nigeria, both triggers fire.
- Article 13(5)(l): the DPO's semi-annual report must assess "legal grounds for cross-border data transfer."
- Article 34(2)(f): data processing agreements must specify the "location of data processing."
- Article 8(3)(f): "substantial involvement in cross-border data flows" is a factor in designating a controller "of major importance," which triggers registration under Articles 8–9.

---

### A4. Ghana Data Protection Act 2012 (Act 843) and Senegal Law 2008-12

**Ghana (Act 843):**

- "Special personal data" is defined to include "the physical, medical, mental health or mental condition or DNA of the data subject" ([DLA Piper Data Protection Laws of the World — Ghana](https://www.dlapiperdataprotection.com/index.html?t=about&c=GH)).
- **No specific international transfer provisions.** DLA Piper records that Act 843 contains no specific provisions governing international data transfers comparable to an adequacy or authorisation regime. What it does have is a foreign-data rule: a controller processing personal data originating from a foreign jurisdiction must ensure compliance with **that country's** data protection legislation ([DLA Piper — Ghana](https://www.dlapiperdataprotection.com/index.html?t=about&c=GH)). This is unusual and matters commercially: it imports the customer's home-country law.
- **No data localisation requirement** ([DLA Piper — Ghana](https://www.dlapiperdataprotection.com/index.html?t=about&c=GH)).
- **Registration is mandatory.** Controllers must register with the Data Protection Commission before processing; certificates are valid two years and require renewal; since January 2015 registration has been enforced, with new controllers registering within twenty days of starting business, and penalties including fines and up to two years' imprisonment ([DLA Piper](https://www.dlapiperdataprotection.com/index.html?t=about&c=GH); [Data Protection Africa Ghana factsheet](https://dataprotection.africa/wp-content/uploads/2020/03/Ghana-Factsheet-updated-20200331.pdf)).
- Breach notification: notify the Commission and the data subject "as soon as reasonably practicable" ([DLA Piper](https://www.dlapiperdataprotection.com/index.html?t=about&c=GH)).
- Retention periods under Act 843: **not established**.
- Specific section numbers for the above: **not established** — none of the secondary sources I could retrieve cite them, and I could not obtain the full statutory text.

**Senegal (Law 2008-12 of 25 January 2008):**

- Still the law in force; a modernising bill was published in 2019 but was not adopted ([Anove regulatory summary](https://www.anove.ai/en/regulations/senegal-law-2008-12)).
- **Prior CDP authorisation** is required for processing genetic data, biometric data, offence-related data, national identification numbers, file interconnections, and public-interest processing ([Anove](https://www.anove.ai/en/regulations/senegal-law-2008-12)).
- **Transfers:** "Transfers are allowed only to countries ensuring sufficient protection, and the CDP must be informed of every transfer with details of the sender, recipient, data and purposes" ([Anove](https://www.anove.ai/en/regulations/senegal-law-2008-12)). Note the same filing-duty pattern as the ECOWAS Act Article 36.
- **No data localisation requirement** mentioned ([Anove](https://www.anove.ai/en/regulations/senegal-law-2008-12)).
- **Whether health data specifically requires prior CDP authorisation, and the governing article numbers: not established.** SenegalLII and DLA Piper's Senegal pages were not retrievable (robots.txt / content mismatch).

---

### A5. WAHO / ECOWAS instruments on health information systems and laboratory data

**What exists:**

- WAHO is ECOWAS's specialised health institution ([ECOWAS](https://www.ecowas.int/institutions/west-african-health-organisation-waho/)).
- **A regional health information systems policy was approved at ministerial level in 2012** ([DHIS2 — WAHO](https://dhis2.org/waho-uses-dhis2/)).
- WAHO operates a **regional data warehouse** on DHIS2 covering all 15 (pre-withdrawal) ECOWAS member states including The Gambia. It currently focuses on **integrated disease surveillance and reporting (IDSR)** data, against a regional core set of **80 essential health indicators**. Quality control happens at national level before transmission to WAHO, and again at WAHO before publication ([DHIS2 — WAHO](https://dhis2.org/waho-uses-dhis2/)).

**What does not exist, as far as I could establish:**

- **The warehouse handles aggregate indicators, not patient-level records.** The DHIS2 account "contains no information about laboratory data integration or components" ([DHIS2 — WAHO](https://dhis2.org/waho-uses-dhis2/)).
- **A WAHO or ECOWAS instrument specifically governing laboratory data or patient-level cross-border health data sharing: not established.** I found no such instrument. Data protection and governance arrangements for the regional warehouse itself are also not detailed in the available source.

**Related regional infrastructure worth knowing about.** SOAC (Système Ouest Africain d'Accréditation / West African Accreditation System) was created in 2010 by UEMOA regulation and accredits **34 medical biology laboratories**, among 136 conformity assessment bodies. It is a signatory to the **AFRAC, ILAC and IAF** multilateral recognition arrangements. Crucially for this product: **SOAC serves eight UEMOA states — Benin, Burkina Faso, Côte d'Ivoire, Guinea-Bissau, Mali, Niger, Senegal and Togo — and The Gambia is not among them** ([SOAC](https://soacwaas.org/)). SOAC has trained reference medical laboratory heads on ISO 15189 and ISO 15190 ([SOAC news](https://www.soac-waas.org/NEWS-57.html)); whether ISO 15189 is formally within its accreditation scope is **not established** from the SOAC site text I retrieved.

---

## B. International acceptance

### B6. HIPAA

**Does HIPAA apply to a company with no US customers? No.** HHS states plainly: "If an entity does not meet the definition of a covered entity or business associate, it does not have to comply with the HIPAA Rules." Covered entities are health care providers transmitting electronic standard transactions, health plans, and health care clearinghouses; the regulatory definitions sit at 45 CFR 160.103 ([HHS — Covered Entities and Business Associates](https://www.hhs.gov/hipaa/for-professionals/covered-entities/index.html)).

**What a US healthcare customer would actually require:**

**1. A Business Associate Agreement.** Required by 45 CFR 164.504(e). HHS's ten required elements ([HHS — Sample BAA Provisions](https://www.hhs.gov/hipaa/for-professionals/covered-entities/sample-business-associate-agreement-provisions/index.html)):

1. Establish permitted and required uses and disclosures of PHI
2. Prohibit use or disclosure beyond what the agreement permits or law requires
3. Implement appropriate safeguards, including Security Rule compliance for ePHI
4. Report unauthorised uses, disclosures and breaches of unsecured PHI to the covered entity
5. Disclose PHI on request to satisfy individual access rights
6. Facilitate amendments to designated record sets as directed
7. Maintain and provide an accounting of disclosures
8. **Flow the same restrictions down to every subcontractor** — this reaches your cloud provider, your backup vendor, your monitoring service
9. Make internal practices, books and records available to HHS
10. Return or destroy all PHI at termination, where feasible

**Enforcement reality for a non-US vendor:** "US courts generally have limited authority over foreign entities, particularly if the vendor has no physical presence, assets, or operations in the United States." US covered entities therefore commonly demand choice-of-law clauses, arbitration provisions, and submission to US jurisdiction in the BAA ([Paubox](https://www.paubox.com/blog/do-foreign-vendors-have-to-sign-a-business-associate-agreement)). Expect these to be non-negotiable asks.

**2. The Security Rule's technical safeguards — 45 CFR 164.312, complete** ([eCFR § 164.312](https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-C/part-164/subpart-C/section-164.312)):

| Standard | Implementation specification | Status |
|---|---|---|
| **(a) Access control** | Unique user identification | **Required** |
| | Emergency access procedure | **Required** |
| | Automatic logoff | Addressable |
| | Encryption and decryption | Addressable |
| **(b) Audit controls** | (standard, no sub-specs) | **Required** |
| **(c) Integrity** | Mechanism to authenticate ePHI | Addressable |
| **(d) Person or entity authentication** | (standard, no sub-specs) | **Required** |
| **(e) Transmission security** | Integrity controls | Addressable |
| | Encryption | Addressable |

"Addressable" is not optional: entities must implement the specification if reasonable and appropriate, or implement an equivalent alternative with documented justification ([HHS Security Rule](https://www.hhs.gov/hipaa/for-professionals/security/laws-regulations/index.html)). The Rule also mandates administrative safeguards (risk analysis, designated security official, workforce security, training, incident response, contingency planning, periodic evaluation, BAAs) and physical safeguards (facility access controls, workstation security, device and media controls) ([HHS](https://www.hhs.gov/hipaa/for-professionals/security/laws-regulations/index.html)).

**3. Breach notification timelines** ([HHS Breach Notification Rule](https://www.hhs.gov/hipaa/for-professionals/breach-notification/index.html)):

- **Business associate → covered entity: without unreasonable delay, no later than 60 days from discovery.** This is the one that binds a vendor directly.
- Covered entity → individuals: without unreasonable delay, no later than 60 days from discovery
- Covered entity → HHS, 500+ individuals: no later than 60 days following the breach
- Covered entity → HHS, fewer than 500: no later than 60 days after the end of the calendar year of discovery
- Media: where more than 500 residents of a state or jurisdiction are affected, within 60 days

**4. Offshore storage.** There is **no HIPAA prohibition on storing PHI outside the United States** ([Paubox](https://www.paubox.com/blog/do-foreign-vendors-have-to-sign-a-business-associate-agreement)). Separately, the DOJ bulk sensitive personal data rule (28 CFR Part 202, effective 8 April 2025) restricts transfers to designated "countries of concern" — **China, Cuba, Iran, North Korea, Russia and Venezuela. No West African country, and specifically not The Gambia, is on that list** ([28 CFR § 202.601](https://www.law.cornell.edu/cfr/text/28/202.601)).

**5. The Security Rule is being rewritten.** The NPRM was published **6 January 2025**, comments closed **7 March 2025**, and as of June 2026 it remains **unfinalised**, with OCR reviewing more than 4,700 comments; OMB's Unified Agenda now targets July 2027, which is not legally binding ([Medcurity](https://medcurity.com/hipaa-security-rule-2026/)). If finalised as proposed it would: make **MFA mandatory** for every system accessing ePHI; make **encryption mandatory at rest and in transit**; require vulnerability scanning at least every six months and annual penetration testing; require business associates to report security incidents **within 24 hours**; require a documented technology asset inventory and network segmentation; and **remove the "addressable" category from most safeguards**, converting them to required. Compliance would follow roughly 240 days after the effective date ([Medcurity](https://medcurity.com/hipaa-security-rule-2026/)). A product being architected now should build to the proposed rule, not the current one — the delta is mostly things a well-built system does anyway.

---

### B7. GDPR

**Is The Gambia on any adequacy list? No.** The European Commission's adequacy decisions cover: Andorra, Argentina, Brazil, Canada (commercial organisations), Faroe Islands, Guernsey, Israel, Isle of Man, Japan, Jersey, New Zealand, Republic of Korea, Switzerland, the United Kingdom (GDPR and LED), the United States (EU–US Data Privacy Framework, for participating commercial organisations), Uruguay, and the European Patent Organisation. **No African country appears on the list; The Gambia, Nigeria, Ghana and Senegal are all absent** ([European Commission — Adequacy decisions](https://commission.europa.eu/law/law-topic/data-protection/international-dimension-data-protection/adequacy-decisions_en)).

**Therefore, for an EU NGO, research institution or donor sending EU personal data to a Gambian-hosted system:**

- Article 45 (adequacy) is unavailable.
- **Article 46 appropriate safeguards is the route.** Available tools: Binding Corporate Rules, **Standard Contractual Clauses adopted by the Commission**, SCCs adopted by a supervisory authority, approved codes of conduct, approved certification mechanisms, and ad hoc contractual clauses ([GDPR Chapter V](https://gdpr-info.eu/chapter-5/)). For a small vendor, **the Commission SCCs are the realistic instrument** — Commission Implementing Decision **2021/914 of 4 June 2021**, designed for transfers from EU/EEA controllers or processors to controllers or processors outside the EEA not subject to GDPR ([European Commission — SCCs](https://commission.europa.eu/law/law-topic/data-protection/international-dimension-data-protection/standard-contractual-clauses-scc_en)).
- **SCCs alone are not sufficient.** Following Schrems II, EDPB Recommendations 01/2020 (final version adopted **18 June 2021**) require exporters to run a six-step roadmap: assess whether third-country law permits government access incompatible with EU standards, identify gaps, adopt contractual/technical/organisational supplementary measures, verify their effectiveness, document the assessment, and monitor it over time ([EDPB Recommendations 01/2020](https://www.edpb.europa.eu/our-work-tools/our-documents/recommendations/recommendations-012020-measures-supplement-transfer_en)). In practice the EU counterparty will ask you to complete a transfer impact assessment covering Gambian law on state access to data.
- Article 49 derogations (explicit consent, contract necessity, legal claims, vital interests, public interest, public register, compelling legitimate interests) exist but are for specific situations, not a systematic transfer basis ([GDPR Chapter V](https://gdpr-info.eu/chapter-5/)).

**For a US-hosted system:** if the US provider is certified under the EU–US Data Privacy Framework, the Commission's adequacy decision covers that transfer ([European Commission](https://commission.europa.eu/law/law-topic/data-protection/international-dimension-data-protection/adequacy-decisions_en)). If not, SCCs plus a transfer impact assessment. Note this creates an asymmetry worth understanding: **a US-hosted deployment with a DPF-certified provider is legally simpler for EU counterparties than a Gambia-hosted one.**

**Health data specifically.** Article 9(1) prohibits processing of "data concerning health" unless an Article 9(2) exception applies. The relevant ones for a clinical laboratory are **9(2)(h)** — "occupational medicine, medical diagnosis, the provision of health or social care or treatment or the management of health or social care systems" — **9(2)(i)** public health, and **9(2)(j)** research/archiving/statistics. Article 9(3) conditions the 9(2)(h) route on the processing being carried out under an obligation of professional secrecy or equivalent confidentiality ([GDPR Article 9, EUR-Lex](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32016R0679)).

---

### B8. Certifications that signal trust to institutional buyers

**ISO/IEC 27001 — Information Security Management System**

- **Covers:** a management system for information security — scope definition, risk assessment, Annex A controls, Statement of Applicability, internal audit, management review. Gavi describes it as providing "a cybersecurity management framework through a documented system of controls" ([Gavi](https://www.gavi.org/gavis-iso-certification-information-security)).
- **Cycle:** certificate valid **three years**; Stage 1 and Stage 2 audits at the start, surveillance audits in years 1 and 2, full recertification in year 3 ([High Table](https://hightable.io/iso-27001-certification-cost/)).
- **Audit days by size**, per ISO/IEC 27006-1:2024: 1–10 employees = 5 days; 11–25 = 6–7 days; 26–50 = 8.5–10 days ([High Table](https://hightable.io/iso-27001-certification-cost/)).
- **Cost — two independent estimates, both from commercial consultancies, so treat as indicative not authoritative:** £5,000–£50,000 total, with micro-businesses under 10 staff at roughly £6,250–£7,000 in year one using a DIY toolkit and excluding consultants ([High Table](https://hightable.io/iso-27001-certification-cost/)); or $30,000–$85,000 first year all-in, with certification body audit fees of $5,000–$10,000 for a small company at 3–6 audit days, and surveillance audits around $7,500 each in years 2 and 3 ([StrongDM](https://www.strongdm.com/blog/iso-27001-certification-cost)).
- **Timeline:** approximately **six months** to complete ([High Table](https://hightable.io/iso-27001-certification-cost/)).

**ISO/IEC 27701 — Privacy Information Management System**

- **Covers:** a PIMS for managing personally identifiable information, addressing privacy controls for both PII controllers and processors across the data lifecycle ([BSI](https://www.bsigroup.com/en-US/products-and-services/standards-services/iso-iec-27701-key-changes-and-guidance/)).
- **Major change:** the **2025 revision, published October 2025**, makes it a **standalone certifiable standard** — ISO 27001 is no longer a prerequisite — and adopts the harmonised high-level structure ([BSI](https://www.bsigroup.com/en-US/products-and-services/standards-services/iso-iec-27701-key-changes-and-guidance/)). In practice, "most accredited certification bodies require ISO 27001 to be in place or implemented concurrently" ([CertBetter](https://certbetter.com/blog/how-much-does-iso-27701-certification-cost)).
- **Cost/time as an add-on to existing ISO 27001** (small org, under 50 staff): roughly **AUD 28,000–54,000** total initial investment and **3–6 months**. From scratch alongside ISO 27001: 9–18 months and AUD 75,000–110,000+ ([CertBetter](https://certbetter.com/blog/how-much-does-iso-27701-certification-cost)).
- Transition deadline for existing 27701:2019 certificates: **not established**.

**SOC 2 Type II**

- **Covers:** an AICPA **attestation report issued by a licensed CPA — not a certification**. Trust Services Criteria: **Security is mandatory**; Availability, Confidentiality, Processing Integrity and Privacy are optional, each adding 15–30% to audit fees ([SOC2Auditors](https://soc2auditors.org/insights/soc-2-type-2-audit-cost/)).
- **Type I vs Type II:** Type I tests control design at a point in time and costs 30–50% less; Type II tests how controls operated over a period ([SOC2Auditors](https://soc2auditors.org/insights/soc-2-type-2-audit-cost/)).
- **Timeline:** observation period **3–12 months**; total elapsed **6–12+ months** across readiness (1–3 months), observation, and fieldwork/reporting (4–8 weeks) ([SOC2Auditors](https://soc2auditors.org/insights/soc-2-type-2-audit-cost/)).
- **Cost:** audit fees **$15,000–$45,000** for startups under 50 employees; first-year total programme **$30,000–$150,000** including readiness ($5,000–$15,000), compliance platform ($7,500–$25,000/yr), penetration testing ($5,000–$15,000), and 80–200 hours of internal team time. A report is generally treated as **valid for 12 months** and must be renewed annually ([SOC2Auditors](https://soc2auditors.org/insights/soc-2-type-2-audit-cost/)).

**Do donors and NGOs in global health typically ask for these?**

This is the question I can least support with hard evidence. What I can establish:

- **Gavi itself holds ISO/IEC 27001**, achieved in 2022, and states that it "assures Gavi's partners, donors and stakeholders that Gavi prioritises robust security and reliability in its delivery" ([Gavi](https://www.gavi.org/gavis-iso-certification-information-security)). Gavi's page says nothing about requiring it of partners or vendors.
- The **Principles for Digital Development** (2024 set: nine principles, including **"Establish people-first data practices"**) are endorsed by **more than 300 organisations** including donors and multilaterals, and over 2014–2024 have "widely influenced funder procurement policies" ([Principles for Digital Development](https://digitalprinciples.org/)). This is the framework donors actually invoke — it is a set of practices, not a certification.
- **Digital Square's Global Goods** criteria — the relevant screen for donor-funded digital health software — are open licensing, community strength and governance, funding diversity, scale and demonstrated effectiveness across multiple countries, and interoperability. **Security, privacy and data protection criteria are not among the criteria stated on Digital Square's own about page** ([Global Goods Guidebook](https://globalgoodsguidebook.org/about/)).

**Conclusion: that global-health donors and NGOs typically require ISO 27001 or SOC 2 from software vendors is *not established*.** The evidence points the other way — donors screen on openness, interoperability, community and country scale, and invoke the Principles for Digital Development rather than certification. Certifications appear to function as differentiators and de-risking signals, not gate criteria. (Note that my searches for donor procurement requirements returned only generic certification-vendor marketing, which I have deliberately not cited.)

---

### B9. ISO 15189:2022 clauses 7.6 and 7.8

From the SADCAS accreditation assessment checklist for ISO 15189:2022 ([SADCAS F 134(a), Issue 3](https://www.sadcas.org/sites/default/files/2025-10/SADCAS%20F%20134(a)%20-%20Management%20%20Requirements%20for%20Medical%20laboratories%20ISO%2015189-2022%20%5BIssue%203%5D.pdf)):

**Clause 7.6 — Control of data and information management**

- **7.6.1 General** — the laboratory has access to the data and information needed to perform laboratory activities.
- **7.6.2 Authorities and responsibilities for information management** — authorities and responsibilities for information system management are specified, and **"the laboratory is ultimately responsible for the laboratory information systems."** This is the clause that makes LIS accountability non-delegable to the vendor.
- **7.6.3 Information systems management** — systems must be:
  - **"validated by the supplier and verified for functionality by the laboratory before introduction"**, and **"any changes to the system … shall be authorized, documented and validated"**
  - **"documented, and the documentation readily available to authorized users, including that for day-to-day functioning"**
  - **"implemented taking cybersecurity into account, to protect the system from unauthorized access and safeguard data against tampering or loss"**
  - **"operated in an environment that complies with supplier specifications"**, or providing conditions that safeguard the accuracy of manual recording
  - **"maintained in a manner that ensures the integrity of the data and information and includes the recording of system failures and the appropriate immediate and corrective actions"**
  - subject to **"calculations and data transfers checked in an appropriate and systematic manner"**
- **7.6.4 Downtime plans** — the laboratory maintains operations during failure or downtime affecting its activities.
- **7.6.5 Off-site management** — where information systems are managed off site or by an external provider, the laboratory ensures the provider **"complies with all applicable requirements of ISO 15189:2022."** This clause is what makes a hosted/cloud LIS contractually consequential: your obligations flow through to your hosting arrangements.

**Clause 7.8 — Continuity and emergency preparedness planning** ([SADCAS](https://www.sadcas.org/sites/default/files/2025-10/SADCAS%20F%20134(a)%20-%20Management%20%20Requirements%20for%20Medical%20laboratories%20ISO%2015189-2022%20%5BIssue%203%5D.pdf))

- Identify risks arising in emergency situations
- Maintain **"plans, procedures, and technical measures to enable continued operations after a disruption"**
- **"Plans periodically tested and the planned response capability exercised, where practicable"**
- Establish planned emergency response considering personnel needs, train relevant staff, respond to actual emergencies, and **"take action to prevent or mitigate the consequences of emergency situations"**

---

## C. Retention periods

### The documented numbers

**United Kingdom — Royal College of Pathologists / IBMS, *The Retention and Storage of Pathological Records and Specimens*, Version 6, October 2025.** This is the most laboratory-specific source available ([RCPath G031 v6](https://www.rcpath.org/static/049ea966-df5c-4a9f-9353ba24a69bb808/bd7ed2ba-8e77-4a2d-8c3ae7e74f3aaaa0/g031-The-retention-and-storage-of-pathological-records-and-specimens.pdf)):

| Record | Retention |
|---|---|
| Primary diagnostic reports | **20 years from last entry; 30 years if cancer diagnosis** |
| Laboratory copies treated as primary medical record | minimum 30 years |
| Laboratory registers / day books | **5 years from specimen receipt** — "to ensure availability for review through at least 1 full cycle of laboratory accreditation" |
| Worksheets | at least until the final report is authorised for all specimens on the worksheet |
| Internal quality control records | **minimum 5 years** |
| External quality assessment records | **minimum 5 years** — "to ensure continuity of data available for laboratory accreditation purposes" |
| Blood transfusion refrigerator/freezer temperature logs | minimum 15 years |
| Histopathology reports | at least 30 years |
| Tissue blocks | 30 years |
| Tissue sections | minimum 8 years (or until age 25 if from a child) |

**United Kingdom — NHS Records Management Code of Practice (version 5, 2023).** The pathology entry is duration-of-need rather than fixed: pathology reports and sample information are kept "as long as there is a clinical need to hold it"; **clinical duplicates go 8 years after discharge or until a child's 25th birthday**, with a historical review triggered if information is retained for 20 years ([NHS England Digital — Appendix II retention schedule: pathology](https://digital.nhs.uk/data-and-information/information-governance/guidance/records-management-code-of-practice/appendix-ii/retention-schedule-pathology); [Code landing page](https://digital.nhs.uk/data-and-information/information-governance/guidance/records-management-code-of-practice)). A peer-reviewed comparative study records the NHS positions as adult inpatient records 8 years after conclusion of treatment, minors until the 25th birthday, and mental health 20 years after last visit ([Tavakoli et al., *Acta Inform Med* 2012;20(3):174–179](https://pmc.ncbi.nlm.nih.gov/articles/PMC3508852/)).

**United States — CLIA, 42 CFR § 493.1105 "Standard: Retention requirements"** ([eCFR § 493.1105](https://www.ecfr.gov/current/title-42/chapter-IV/subchapter-G/part-493/subpart-J/subject-group-ECFR7c4a2ac1d0b5f1b/section-493.1105)):

| Record | Retention |
|---|---|
| Test requisitions and test authorizations | **at least 2 years** |
| Each test procedure | at least 2 years after the procedure is discontinued |
| Analytic systems records (QC and patient test records) | **at least 2 years** |
| Proficiency testing records | at least 2 years |
| Quality systems assessment records | at least 2 years |
| Test reports (general) | **at least 2 years after the date of reporting** |
| **Pathology test reports** | **at least 10 years** |
| Cytology slide preparations | at least 5 years from examination |
| Histopathology slides | at least 10 years from examination |
| Pathology specimen blocks | at least 2 years from examination |
| Immunohematology records | per 21 CFR 606.160 |

Separately, AHIMA recommends 10 years after the last encounter for adult records, against a US federal minimum of 5 years, with US state rules spanning 5–30 years and permanent retention in West Virginia ([Tavakoli et al. 2012](https://pmc.ncbi.nlm.nih.gov/articles/PMC3508852/)).

**Africa — South Africa, HPCSA Guidelines on the Keeping of Patient Health Records (Booklet 9, September 2022)** ([HPCSA Booklet 9](https://www.hpcsa.co.za/Uploads/professional_practice/ethics/Booklet_9_Keeping_of_Patient_Records_Review%20Draft_vSept_2022.pdf)):

- **General minimum: 6 years from the date the record becomes dormant (date of last treatment)**
- **Minors: until the patient's 21st birthday** (covering the three-year window after majority)
- **Mentally incapacitated patients: lifetime**
- **Occupational disease / hazardous exposure: 20 years** after treatment, under the Occupational Health and Safety Act 85 of 1993; **minimum 25 years** recommended for late-manifesting conditions such as asbestosis
- Statutory basis: National Health Act 61 of 2003 and OHSA 85 of 1993

**WHO — two relevant positions, both of which decline to set a number:**

1. WHO's *Medical Records Manual: A Guide for Developing Countries* states **"there is no general retention policy"** and that individual institutions should determine their own retention periods (as reported in [Tavakoli et al. 2012](https://pmc.ncbi.nlm.nih.gov/articles/PMC3508852/); I could not retrieve the WHO manual itself — iris.who.int returned 403).
2. **WHO AFRO's SLIPTA Checklist, Version 2:2015** — the instrument African laboratories are actually assessed against — likewise defers. Section 1.10 (Data Files) requires records be **"archived for a specified time period in accordance with national/international guidelines,"** and states that the **"retention period may vary; however, the reported results shall be retrievable for as long as medically relevant."** Section 1.11 requires that **"archived patient results must be easily, readily and completely retrievable within a timeframe consistent with patient care needs"** ([WHO AFRO SLIPTA checklist](https://www.afro.who.int/sites/default/files/2017-06/slipta-checkist0711.pdf)).

SLIPTA also carries LIS-relevant items: section 9.5 requires data **"stored in a secure location accessible only to authorized personnel"**; section 9.6 requires **"controlled access to patient data"** and verification that electronically transmitted results are correct; section 9.9 requires **"ongoing system checks available for correct transmissions, calculations and storage of results and records."**

**The Gambia:** no national retention rule for medical or laboratory records was found. **Not established.**

### Reading a defensible number out of this

The following is my inference from the sourced figures above, and I flag it as inference rather than a sourced fact. The anchors converge as follows:

- **Absolute floor for general laboratory test reports: 2 years** — the CLIA minimum ([42 CFR 493.1105](https://www.ecfr.gov/current/title-42/chapter-IV/subchapter-G/part-493/subpart-J/subject-group-ECFR7c4a2ac1d0b5f1b/section-493.1105)). Too short to be credible to anyone but a US regulator, and CLIA itself goes to 10 years for pathology reports.
- **The band where independent jurisdictions cluster for patient-facing records: 6 to 10 years** — South Africa 6 years from last treatment, NHS 8 years after treatment for adults, CLIA 10 years for pathology reports, AHIMA 10 years after last encounter.
- **The laboratory-professional recommendation is materially longer: 20 years, 30 with cancer** ([RCPath G031 v6](https://www.rcpath.org/static/049ea966-df5c-4a9f-9353ba24a69bb808/bd7ed2ba-8e77-4a2d-8c3ae7e74f3aaaa0/g031-The-retention-and-storage-of-pathological-records-and-specimens.pdf)).
- **Two independent anchors converge on 5 years for QC and EQA records**, both tied explicitly to covering at least one accreditation cycle ([RCPath G031 v6](https://www.rcpath.org/static/049ea966-df5c-4a9f-9353ba24a69bb808/bd7ed2ba-8e77-4a2d-8c3ae7e74f3aaaa0/g031-The-retention-and-storage-of-pathological-records-and-specimens.pdf); CLIA's 2-year figure is the lower bound).
- **Paediatric records are governed by an age, not a duration**, in every jurisdiction that addresses them: 21st birthday (South Africa), 25th birthday (NHS, RCPath).

**A defensible default for a jurisdiction that has set no rule** would be: **10 years from the date of reporting for patient test results, 5 years for internal QC and EQA records, and — for paediatric patients — until the 21st birthday or 10 years from reporting, whichever is later.** Every element sits at or above the minimum of at least two named jurisdictions, and none exceeds the highest documented figure. It is below RCPath's 20/30-year recommendation, so if the product is used in oncology diagnostics an extended 20-year class is worth supporting. Critically, SLIPTA requires the period be set "in accordance with national/international guidelines" and results be "retrievable for as long as medically relevant" — so **the product's obligation is to make retention configurable per deployment and to document the chosen basis**, not to hardcode a number.

---

## What a Gambian clinical lab system must do to be credible locally and internationally

Only conclusions that follow directly from the sourced facts above.

### MUST — legally required somewhere named

1. **Comply with The Gambia's Personal Data Protection and Privacy Act 2025 — but do not assume it is in force, and do not treat secondary commentary as the spec.** The retrieved primary text is the National Assembly **DATA PROTECTION AND PRIVACY BILL, 2024** ([tracker](https://assembly.gm/bills/364); [PDF](https://assembly.gm/bills/364/download); short title s.1: Personal Data Protection and Privacy Bill, 2024). Tracker stage: Assented. A July 2026 tracker timestamp is a record-entry date, not the assent date. Passage on 29 September 2025 is **Reported**. Assent date, commencement, and Gazette text: **not established**. Cite as "s.X of the Bill as published by the National Assembly; not verified against the enacted 2025 text." **The Bill text names the Information Commission (ATI Act 2021) as the regulator (s.38)** — that resolves the secondary-source name conflict for product work, pending Gazette verification. **Product constraints: PRD v0.5 §12.**

2. **Notify personal data breaches to the regulator within 72 hours** of becoming aware, and affected data subjects without undue delay where high risk exists. This is the requirement under the Gambian Act ([Techhive](https://www.techhiveadvisory.africa/insights/review-of-gambias-personal-data-protection-and-privacy-act-2025); [Captain Compliance](https://captaincompliance.com/education/gambia-personal-data-protection-and-privacy-act/)) **and** under Nigeria's NDPA s.40 ([NDPA text](https://www.dataguidance.com/sites/default/files/data_protection_act_2023.pdf)). The system must therefore have breach detection and an incident clock measured in hours.

3. **Treat all test results as sensitive/health data with a distinct lawful basis and heightened controls.** Required by: the ECOWAS Supplementary Act Article 30, where health data may be processed only when strictly necessary, with explicit legal authorisation, or to protect vital interests ([FPF](https://fpf.org/wp-content/uploads/2024/02/Africa-RECs-Report-.pdf); [INTERPOL/WAPIS](https://www.interpol.int/content/download/16379/file/20COM0370-%20WAPIS_Best%20Practice%20Guide%20on%20data%20protection_EN_04_LRchapter_Optimized.pdf)); Nigeria's NDPA s.30 ([NDPA text](https://www.dataguidance.com/sites/default/files/data_protection_act_2023.pdf)); Ghana's Act 843 "special personal data" ([DLA Piper](https://www.dlapiperdataprotection.com/index.html?t=about&c=GH)); the Gambian Act ([Techhive](https://www.techhiveadvisory.africa/insights/review-of-gambias-personal-data-protection-and-privacy-act-2025)); and GDPR Article 9 ([EUR-Lex](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32016R0679)).

4. **Support an adequacy-or-safeguards test on every cross-border transfer, and record the assessment.** Every applicable regime imposes one: ECOWAS Article 36, Malabo (no transfer outside the AU without adequate protection), Nigeria ss.41–43, Senegal, the Gambian Act, and GDPR Chapter V. Sources as cited in sections A1–A4 and B7.

5. **Support a per-transfer notification/filing capability.** ECOWAS Article 36 imposes "an obligation for controllers to notify the DPA of such transfers" ([FPF](https://fpf.org/wp-content/uploads/2024/02/Africa-RECs-Report-.pdf)), and Senegal requires the CDP "be informed of every transfer with details of the sender, recipient, data and purposes" ([Anove](https://www.anove.ai/en/regulations/senegal-law-2008-12)). A system that cannot enumerate what left, to whom, and why, cannot satisfy this.

6. **Produce DPIA inputs for Nigerian deployments.** Under GAID 2025 a DPIA is mandatory for both "health care services" (Art 28(3)(i)) and "cross-border data transfer" (Art 28(3)(o)) — a Nigerian clinical lab deployment triggers both ([NDPC GAID 2025](https://ndpc.gov.ng/wp-content/uploads/2025/07/NDP-ACT-GAID-2025-MARCH-20TH.pdf)).

7. **Register as a data controller for Ghanaian deployments** — registration with the Data Protection Commission is mandatory before processing, valid two years, with criminal penalties for non-compliance ([DLA Piper](https://www.dlapiperdataprotection.com/index.html?t=about&c=GH); [Data Protection Africa Ghana factsheet](https://dataprotection.africa/wp-content/uploads/2020/03/Ghana-Factsheet-updated-20200331.pdf)).

8. **If a US healthcare customer is ever taken on: sign a BAA and meet 45 CFR 164.312.** Concretely and minimally, the Required specifications: unique user identification, emergency access procedure, audit controls, person-or-entity authentication, and transmission security ([eCFR § 164.312](https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-C/part-164/subpart-C/section-164.312)); plus the ten BAA elements including subcontractor flow-down ([HHS](https://www.hhs.gov/hipaa/for-professionals/covered-entities/sample-business-associate-agreement-provisions/index.html)); plus breach reporting to the covered entity within 60 days ([HHS](https://www.hhs.gov/hipaa/for-professionals/breach-notification/index.html)). **Absent a US covered-entity customer, HIPAA imposes nothing** ([HHS](https://www.hhs.gov/hipaa/for-professionals/covered-entities/index.html)).

9. **If EU personal data is involved: Commission SCCs (Decision 2021/914) plus a transfer impact assessment.** The Gambia has no adequacy decision and no African country does ([European Commission](https://commission.europa.eu/law/law-topic/data-protection/international-dimension-data-protection/adequacy-decisions_en)), so Article 46 is the only systematic route, and EDPB Recommendations 01/2020 require the six-step assessment on top ([EDPB](https://www.edpb.europa.eu/our-work-tools/our-documents/recommendations/recommendations-012020-measures-supplement-transfer_en)).

10. **No data localisation obligation exists in any framework examined.** Nigeria ([NDPA text](https://www.dataguidance.com/sites/default/files/data_protection_act_2023.pdf)), Ghana ([DLA Piper](https://www.dlapiperdataprotection.com/index.html?t=about&c=GH)), and Senegal ([Anove](https://www.anove.ai/en/regulations/senegal-law-2008-12)) all lack one; none was found for The Gambia. Offshore hosting is therefore lawful — but Nigeria's s.43 leaves the door open to future category-specific restrictions ([FPF](https://fpf.org/blog/nigerias-new-data-protection-act-explained/)), so hosting location should be a configuration, not an architectural assumption.

### SHOULD — expected by buyers, accreditors, or donors

11. **Build to ISO 15189:2022 clause 7.6 as the product specification.** This is the single most concretely actionable standard for this product. Specifically: supplier validation before introduction plus laboratory verification of functionality; authorised, documented and validated change control; documentation available to authorised users; cybersecurity-informed protection against unauthorised access, tampering and loss; integrity maintenance including **recording of system failures with immediate and corrective actions**; systematic checking of calculations and data transfers; downtime plans (7.6.4); and — for any hosted deployment — external provider compliance with ISO 15189 (7.6.5). The laboratory remains "ultimately responsible" (7.6.2), which means the product must give the lab the evidence to discharge that responsibility ([SADCAS F 134(a)](https://www.sadcas.org/sites/default/files/2025-10/SADCAS%20F%20134(a)%20-%20Management%20%20Requirements%20for%20Medical%20laboratories%20ISO%2015189-2022%20%5BIssue%203%5D.pdf)).

12. **Ship offline continuity as a tested capability, not a feature claim.** ISO 15189:2022 clause 7.8 requires plans, procedures and technical measures for continued operation after disruption, and that plans be "periodically tested and the planned response capability exercised" ([SADCAS](https://www.sadcas.org/sites/default/files/2025-10/SADCAS%20F%20134(a)%20-%20Management%20%20Requirements%20for%20Medical%20laboratories%20ISO%2015189-2022%20%5BIssue%203%5D.pdf)). For an offline-first product this is an asset — but only if the continuity path is exercised and evidenced.

13. **Meet the WHO AFRO SLIPTA information-management items**, since this is what African labs are actually audited against on the road to accreditation: secure storage accessible only to authorised personnel (9.5), controlled access to patient data and verification of electronically transmitted results (9.6), ongoing system checks for correct transmission, calculation and storage (9.9), archived results readily and completely retrievable (1.11) ([WHO AFRO SLIPTA checklist](https://www.afro.who.int/sites/default/files/2017-06/slipta-checkist0711.pdf)).

14. **Align with The Gambia's own stated national plan.** The National Health Laboratory Services Policy 2021–2025 commits to "implement an integrated LIMS in the laboratory network," to "develop and implement an electronic, integrated LIMS in all laboratories in the network," to link LIMS to **DHIS2**, to enrol general and district hospital laboratories in **SLIPTA**, and — long-term — to "ensure reference and teaching hospital laboratories are **ISO 15189 accredited**." It records that the current system is paper-based at peripheral levels with incomplete and inaccurate facility-level data ([Gambia National Health Laboratory Services Policy 2021–2025](https://dspd.forte-data.com/d/5b212d8f-914f-11ef-b086-029254d29bb1)). **DHIS2 export and SLIPTA/ISO 15189 alignment are named national requirements, not optional differentiators.**

15. **Make retention configurable per deployment, with a documented default.** No Gambian rule exists, SLIPTA explicitly defers to "national/international guidelines," and the credible international anchors run 2–30 years depending on record class and jurisdiction. Support at minimum: distinct retention classes for patient results, QC/EQA records, and paediatric records keyed to a birthday rather than a duration. Sources as in section C.

16. **Support DHIS2/IDSR-shaped aggregate export.** WAHO's regional data warehouse runs on DHIS2 across all ECOWAS states including The Gambia, focused on IDSR data against a core set of 80 essential health indicators ([DHIS2 — WAHO](https://dhis2.org/waho-uses-dhis2/)). This is the existing regional reporting channel.

17. **Adopt the Principles for Digital Development posture, especially "Establish people-first data practices."** Endorsed by 300+ organisations and having "widely influenced funder procurement policies" ([Principles for Digital Development](https://digitalprinciples.org/)). For donor-funded work this is more likely to be asked about than any certification.

18. **Prioritise interoperability and open licensing if donor funding is a target.** Digital Square's Global Goods criteria are open licensing, community governance, funding diversity, multi-country scale with demonstrated effectiveness, and interoperability ([Global Goods Guidebook](https://globalgoodsguidebook.org/about/)).

19. **Design now to the proposed HIPAA Security Rule, not the current one.** Mandatory MFA, encryption at rest and in transit, asset inventory, network segmentation, semi-annual vulnerability scanning and annual penetration testing are proposed to become required ([Medcurity](https://medcurity.com/hipaa-security-rule-2026/)). These are also what a security-conscious EU or institutional buyer will ask about regardless of whether the rule is ever finalised.

### OPTIONAL — worth doing, but not required by anything named

20. **ISO/IEC 27001.** Roughly six months and £5,000–£50,000 (or $30,000–$85,000 first year on the higher estimate), three-year certificate with annual surveillance ([High Table](https://hightable.io/iso-27001-certification-cost/); [StrongDM](https://www.strongdm.com/blog/iso-27001-certification-cost)). The strongest supporting datapoint is that Gavi holds it and frames it as assurance to "partners, donors and stakeholders" ([Gavi](https://www.gavi.org/gavis-iso-certification-information-security)) — meaning it speaks the language institutional health buyers already use.

21. **ISO/IEC 27701.** Now standalone-certifiable since the October 2025 revision, though most certification bodies still expect ISO 27001 concurrently; roughly 3–6 months and AUD 28,000–54,000 as an add-on ([BSI](https://www.bsigroup.com/en-US/products-and-services/standards-services/iso-iec-27701-key-changes-and-guidance/); [CertBetter](https://certbetter.com/blog/how-much-does-iso-27701-certification-cost)). Most relevant if the buyer base becomes privacy-regulated rather than security-conscious.

22. **SOC 2 Type II.** 6–12+ months elapsed, $30,000–$150,000 first-year total, valid 12 months and renewed annually ([SOC2Auditors](https://soc2auditors.org/insights/soc-2-type-2-audit-cost/)). Primarily a US commercial signal; the annual renewal makes it the most expensive of the three to sustain.

23. **Ratification-driven changes are outside your control but worth tracking.** The Gambia has signed but not ratified the Malabo Convention ([AU status list](https://au.int/sites/default/files/treaties/29560-sl-AFRICAN_UNION_CONVENTION_ON_CYBER_SECURITY_AND_PERSONAL_DATA_PROTECTION_0.pdf); [Data Protection Africa](https://dataprotection.africa/the-gambia/)), and the ECOWAS Supplementary Act is under revision ([RAO Support Cell](https://www.raosupportcellecowas.com/post/ecowas-online-workshop-on-the-review-of-the-preliminary-draft-of-the-revised-supplementary-act-a-sa)). Both could tighten transfer obligations.

### Explicitly not established

- The exact enumerated conditions in ECOWAS Article 36, and the Act's full article text
- The Malabo Convention's specific wording on health data
- Whether the revised ECOWAS Supplementary Act has been adopted
- Whether Nigeria's NDPC has published an operative adequacy whitelist naming the US or EU
- Section numbers for Ghana's Act 843 provisions, and any Ghanaian retention rule
- Whether Senegalese law requires prior CDP authorisation specifically for health data, and the governing article numbers
- Any WAHO or ECOWAS instrument specifically governing laboratory data or patient-level cross-border health data sharing
- Any Gambian national retention rule for medical or laboratory records
- The gazetted 2025 Act text (the retrieved PDF is probably the tabled 2024 Bill). Penalty figures are the known divergence
- Assent date, and whether the Act is in force
- HMIS Policy 2017–2025 full text (unread)
- MDCG Code of Conduct and Medical Ethics 2011 / MDCG Regulations (unread at document level)
- Whether the Information Commission has adopted any s.37(1)(b) transfer instrument (no evidence)
- Whether a data-protection commissioner under s.39 has been appointed (no public evidence)
- Regulator *name* in secondary commentary (three sources conflict). **Superseded for product work:** s.38 of the Bill as published by the National Assembly names the Information Commission (ATI Act 2021). Still verify against the Gazette
- That global-health donors or NGOs typically require ISO 27001 or SOC 2 from software vendors
- Whether ISO 15189 falls within SOAC's formal accreditation scope
- The ISO 27701:2019 → :2025 transition deadline

---

## Sources

**A1 — ECOWAS Supplementary Act**
- [Future of Privacy Forum, *GLOBAL RECs: Towards a Continental Approach to Data Protection in Africa* (Feb 2024)](https://fpf.org/wp-content/uploads/2024/02/Africa-RECs-Report-.pdf)
- [INTERPOL / WAPIS, Best Practice Guide on Data Protection (June 2020)](https://www.interpol.int/content/download/16379/file/20COM0370-%20WAPIS_Best%20Practice%20Guide%20on%20data%20protection_EN_04_LRchapter_Optimized.pdf)
- [Digital Watch Observatory — Supplementary Act on Personal Data Protection within ECOWAS](https://dig.watch/resource/suplementary-act-personal-data-protection-within-ecowas)
- [Academia.edu — *African Bodies: ECOWAS and data protection*](https://www.academia.edu/144438302/African_Bodies_ECOWAS_and_data_protection)
- [RAO Support Cell ECOWAS — Online workshop on the revised Supplementary Act (Oct 2024)](https://www.raosupportcellecowas.com/post/ecowas-online-workshop-on-the-review-of-the-preliminary-draft-of-the-revised-supplementary-act-a-sa)
- [ECOWAS — Burkina Faso, Mali and Niger's withdrawal from ECOWAS is now a reality](https://www.ecowas.int/burkina-faso-mali-and-nigers-withdrawal-from-ecowas-is-now-a-reality/)
- [AfricanLII — Supplementary Act A/SA.1.01/10 (record page; PDF did not load)](https://africanlii.org/akn/aa-ecowas/act/2010/1-1/eng@2010-12-31)

**A2 — Malabo Convention**
- [African Union — AU Convention on Cyber Security and Personal Data Protection (treaty page)](https://au.int/en/treaties/african-union-convention-cyber-security-and-personal-data-protection)
- [African Union — Official status list, dated 02/02/2026 (PDF)](https://au.int/sites/default/files/treaties/29560-sl-AFRICAN_UNION_CONVENTION_ON_CYBER_SECURITY_AND_PERSONAL_DATA_PROTECTION_0.pdf)
- [EJIL:Talk! — The Malabo Convention enters into force](https://www.ejiltalk.org/the-african-unions-malabo-convention-on-cyber-security-and-personal-data-protection-enters-into-force-nearly-after-a-decade-what-does-it-mean-for-data-privacy-in-africa-or-beyond/)
- [Michalsons — AU Convention on Cyber Security and Personal Data Protection](https://www.michalsons.com/blog/au-convention-on-cyber-security-and-personal-data-protection-malabo-convention/65281)
- [CIPIT (Strathmore) — The AU Convention: Key Insights](https://cipit.strathmore.edu/the-african-union-convention-on-cyber-security-and-personal-data-protection-key-insights/)
- [Wikipedia — Malabo Convention (cited only to flag the ratification discrepancy)](https://en.wikipedia.org/wiki/Malabo_Convention)

**A3 — Nigeria**
- [Nigeria Data Protection Act 2023, full text (PDF via DataGuidance)](https://www.dataguidance.com/sites/default/files/data_protection_act_2023.pdf)
- [Future of Privacy Forum — Nigeria's New Data Protection Act, Explained](https://fpf.org/blog/nigerias-new-data-protection-act-explained/)
- [NDPC — Nigeria Data Protection Act General Application and Implementation Directive 2025 (PDF)](https://ndpc.gov.ng/wp-content/uploads/2025/07/NDP-ACT-GAID-2025-MARCH-20TH.pdf)
- [Digital Policy Alert — NDPC adopts GAID 2025 including cross-border transfer regulation](https://digitalpolicyalert.org/event/28383-nigeria-data-protection-act-2023-general-application-and-implementation-directive-2025-ndpcndp-act-gaid012025-including-cross-border-data-transfer-regulation-was-adopted-by-nigeria-data-protection-commission)
- [LawGlobal Hub — Nigeria Data Protection Act 2023 (section index)](https://www.lawglobalhub.com/nigeria-data-protection-act-2023/)

**A4 — Ghana and Senegal**
- [DLA Piper Data Protection Laws of the World — Ghana](https://www.dlapiperdataprotection.com/index.html?t=about&c=GH)
- [Data Protection Africa — Ghana factsheet (PDF, 31 March 2020)](https://dataprotection.africa/wp-content/uploads/2020/03/Ghana-Factsheet-updated-20200331.pdf)
- [ITLawCo — Ghana's Data Protection Act 2012 (Act 843)](https://itlawco.com/focus-areas/data-protection-and-privacy/ghanas-data-protection-act-2012-act-843/)
- [Anove — Senegal Law No. 2008-12 on Personal Data Protection](https://www.anove.ai/en/regulations/senegal-law-2008-12)
- [SenegalLII — Loi 2008-12 (record page; not retrievable)](https://senlii.org/en/akn/sn/act/2008/12/fra@2008-05-03)

**A5 — WAHO / regional health data**
- [DHIS2 — Monitoring regional health data in West Africa (WAHO)](https://dhis2.org/waho-uses-dhis2/)
- [ECOWAS — West African Health Organisation (WAHO)](https://www.ecowas.int/institutions/west-african-health-organisation-waho/)
- [SOAC — Système Ouest Africain d'Accréditation](https://soacwaas.org/)
- [SOAC/WAAS — Training of heads of reference medical laboratories (ISO 15189 and ISO 15190)](https://www.soac-waas.org/NEWS-57.html)

**The Gambia**
- [National Assembly — DATA PROTECTION AND PRIVACY BILL, 2024 (tracker)](https://assembly.gm/bills/364) · [PDF](https://assembly.gm/bills/364/download). Short title s.1: Personal Data Protection and Privacy Bill, 2024. **Probably the tabled Bill, not the gazetted 2025 Act.**
- [Techhive Advisory — Review of Gambia's Personal Data Protection and Privacy Act, 2025](https://www.techhiveadvisory.africa/insights/review-of-gambias-personal-data-protection-and-privacy-act-2025)
- [Captain Compliance — Gambia Personal Data Protection and Privacy Act](https://captaincompliance.com/education/gambia-personal-data-protection-and-privacy-act/)
- [Data Protection Africa — The Gambia fact sheet](https://dataprotection.africa/the-gambia/)
- [Malagen — Explainer: What The Gambia's Personal Data Protection Act Means for You](https://malagen.org/media-monitoring/explainer-what-the-gambias-personal-data-protection-act-means-for-you/)
- [Republic of The Gambia — National Health Laboratory Services Policy 2021–2025](https://dspd.forte-data.com/d/5b212d8f-914f-11ef-b086-029254d29bb1) ([policy repository record](https://policies.gov.gm/f/5b212d8f-914f-11ef-b086-029254d29bb1))

**B6 — HIPAA**
- [HHS — Covered Entities and Business Associates](https://www.hhs.gov/hipaa/for-professionals/covered-entities/index.html)
- [HHS — Sample Business Associate Agreement Provisions](https://www.hhs.gov/hipaa/for-professionals/covered-entities/sample-business-associate-agreement-provisions/index.html)
- [HHS — Security Rule, Laws and Regulations](https://www.hhs.gov/hipaa/for-professionals/security/laws-regulations/index.html)
- [eCFR — 45 CFR § 164.312 Technical safeguards](https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-C/part-164/subpart-C/section-164.312)
- [HHS — Breach Notification Rule](https://www.hhs.gov/hipaa/for-professionals/breach-notification/index.html)
- [Paubox — Do foreign vendors have to sign a business associate agreement?](https://www.paubox.com/blog/do-foreign-vendors-have-to-sign-a-business-associate-agreement)
- [Medcurity — HIPAA Security Rule 2026: What to Expect When OCR Finalizes](https://medcurity.com/hipaa-security-rule-2026/)
- [Cornell LII — 28 CFR § 202.601 Determination of countries of concern](https://www.law.cornell.edu/cfr/text/28/202.601)

**B7 — GDPR**
- [European Commission — Adequacy decisions](https://commission.europa.eu/law/law-topic/data-protection/international-dimension-data-protection/adequacy-decisions_en)
- [European Commission — Standard Contractual Clauses (SCC)](https://commission.europa.eu/law/law-topic/data-protection/international-dimension-data-protection/standard-contractual-clauses-scc_en)
- [GDPR Chapter V — Transfers of personal data to third countries (Arts 44–49)](https://gdpr-info.eu/chapter-5/)
- [EUR-Lex — Regulation (EU) 2016/679, Article 9](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32016R0679)
- [EDPB — Recommendations 01/2020 on supplementary measures](https://www.edpb.europa.eu/our-work-tools/our-documents/recommendations/recommendations-012020-measures-supplement-transfer_en)

**B8 — Certifications and donor expectations**
- [High Table — ISO 27001 Certification Cost (2026 update)](https://hightable.io/iso-27001-certification-cost/)
- [StrongDM — ISO 27001 Certification Cost Breakdown 2026](https://www.strongdm.com/blog/iso-27001-certification-cost)
- [BSI — ISO/IEC 27701:2025 Key Changes and Guidance](https://www.bsigroup.com/en-US/products-and-services/standards-services/iso-iec-27701-key-changes-and-guidance/)
- [CertBetter — ISO 27701 Certification Cost: Real 2026 Prices](https://certbetter.com/blog/how-much-does-iso-27701-certification-cost)
- [SOC2Auditors — SOC 2 Type 2 Audit Cost (2026)](https://soc2auditors.org/insights/soc-2-type-2-audit-cost/)
- [Gavi — Gavi's ISO certification for information security](https://www.gavi.org/gavis-iso-certification-information-security)
- [Principles for Digital Development](https://digitalprinciples.org/)
- [Digital Square — Global Goods Guidebook, About](https://globalgoodsguidebook.org/about/)

**B9 — ISO 15189:2022**
- [SADCAS F 134(a) — Management Requirements for Medical Laboratories, ISO 15189:2022, Issue 3 (PDF)](https://www.sadcas.org/sites/default/files/2025-10/SADCAS%20F%20134(a)%20-%20Management%20%20Requirements%20for%20Medical%20laboratories%20ISO%2015189-2022%20%5BIssue%203%5D.pdf)

**C — Retention**
- [Royal College of Pathologists / IBMS — *The Retention and Storage of Pathological Records and Specimens*, Version 6, October 2025 (PDF)](https://www.rcpath.org/static/049ea966-df5c-4a9f-9353ba24a69bb808/bd7ed2ba-8e77-4a2d-8c3ae7e74f3aaaa0/g031-The-retention-and-storage-of-pathological-records-and-specimens.pdf)
- [NHS England Digital — Records Management Code of Practice](https://digital.nhs.uk/data-and-information/information-governance/guidance/records-management-code-of-practice)
- [NHS England Digital — Appendix II, retention schedule: pathology](https://digital.nhs.uk/data-and-information/information-governance/guidance/records-management-code-of-practice/appendix-ii/retention-schedule-pathology)
- [eCFR — 42 CFR § 493.1105 Standard: Retention requirements (CLIA)](https://www.ecfr.gov/current/title-42/chapter-IV/subchapter-G/part-493/subpart-J/subject-group-ECFR7c4a2ac1d0b5f1b/section-493.1105)
- [HPCSA — Booklet 9, Guidelines on the Keeping of Patient Health Records (Sept 2022, PDF)](https://www.hpcsa.co.za/Uploads/professional_practice/ethics/Booklet_9_Keeping_of_Patient_Records_Review%20Draft_vSept_2022.pdf)
- [Tavakoli N, Saghaiannejad S, Habibi MR. *A Comparative Study of Laws and Procedures Pertaining to the Medical Records Retention in Selected Countries.* Acta Inform Med. 2012;20(3):174–179](https://pmc.ncbi.nlm.nih.gov/articles/PMC3508852/)
- [WHO AFRO — SLIPTA Checklist, Version 2:2015 (PDF)](https://www.afro.who.int/sites/default/files/2017-06/slipta-checkist0711.pdf)
- [WHO AFRO — Guide for the Stepwise Laboratory Improvement Process Towards Accreditation (SLIPTA)](https://www.afro.who.int/publications/who-guide-stepwise-laboratory-improvement-process-towards-accreditation-slipta-african)
