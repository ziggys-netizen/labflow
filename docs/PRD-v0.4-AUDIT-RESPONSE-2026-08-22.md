# PRD v0.4 adversarial audit — response (22 August 2026)

**Status:** All document-level findings in the 22 Aug 2026 adversarial audit are **accepted**.  
**Scope:** specification documents only. No product features were implemented. Firestore rules were not deployed. No real patient names were written to the database.  
**Working spec produced:** [`docs/LabFlow-PRD-v0.4.1.md`](LabFlow-PRD-v0.4.1.md)  
**Item map:** [`docs/AUDIT-v0.4-ACTIONS.md`](AUDIT-v0.4-ACTIONS.md)

---

## 1. File search

The audit was written against `/home/claude/labflow/` (a Claude project tree, not this Windows workspace). Search of this repo, `C:\Users\kanui\Documents`, Desktop, Downloads, and Cursor uploads:

| Sought | Result |
|---|---|
| LabFlow PRD v0.4 (research-grounded LIMS spec the audit quotes) | **Not in this repo.** Not on disk under that content. `DEPLOY-2026-08-21.md` still says “Do not write PRD v0.4 yet.” |
| `LabFlow-PRD-v0.3.md` (same lineage: SLIPTA, offline taxonomy, §11 Act of 2025) | **Not in this repo.** |
| `lims-research.md` | **Not found.** Closest in-repo research: `RESEARCH-result-review.md` (result-review UX only). |
| `docs/ADR-001-trusted-server.md` | **Found:** `docs/ADR-001-trusted-server.md` (Accepted, Option B). |
| `LabFlow-prompts-Q-21Aug2026.md` | **Not found as a file.** Audit-log field spec is embodied in `app/lib/auditTypes.ts` (`targetLabel` = patient name + Lab ID; `AUDIT_ACTIONS` list). Q prompts exist as conversation commands, not a single markdown file. |
| `RULES-TESTING.md`, `firestore.rules`, `DEPLOY-2026-08-21.md` | **Found** at repo root. |
| Repo working PRD | `docs/PRD.md` — **v0.2** (20 Aug 2026). |
| Desktop `C:\Users\kanui\Desktop\LAB-FLOW\LabFlow-PRD-v0.3-Full-System.md` and `…v0.4-Full-System.md` | **Different lineage** (store/OCR/WhatsApp founder vision). Same product name, not the document the audit audited. Left unedited. Not copied into this repo. |
| Downloads `LabFlow-PRD-v0.2*.md`, `LabFlow-PRD-v1.1-Complete.md`, `LabFlow-requirements-backlog-21Aug2026.md` | v0.2 matches repo `docs/PRD.md`. v1.1 is the store-accountability lineage. Backlog is a 21 Aug holding pen for v0.3, not v0.3 itself. |

**Therefore Goal 3 applies:** v0.4 does not exist in this repo. This file records the audit as accepted. v0.4.1 is a **reconstructed** working spec of the *affected sections*, not a line-edit of a missing file.

---

## 2. Reconstruction basis (honesty)

v0.4.1 is built from:

1. The full 22 Aug 2026 adversarial audit (quotes of v0.4 structure and claims).
2. `docs/PRD.md` v0.2 (inventory, onboarding, dashboard, import — the modules 4.1 says v0.4 dropped).
3. `docs/ADR-001-trusted-server.md`, `RULES-TESTING.md`, `firestore.rules` (undeployed), `DEPLOY-2026-08-21.md`, `OFFLINE.md`, `S7-EXPORT.md`, `RESEARCH-result-review.md`.
4. Application code in this tree as of 22 Aug 2026 (`app/lib/permissions.ts`, membership, join API, audit types, inventory, register, rules).

**Not used as if they were sources:** invented commencement dates, GSMA page citations, current national power figures, Act section numbers, a six-product name list, or the missing `lims-research.md` itself. Where the audit attributes a figure to that research file, v0.4.1 restates the figure **only** as “quoted from the audit’s citation of `lims-research.md`; original file not in this repo.”

Method claim in v0.4.1: **everything unverified is marked.** The v0.4 claim “Nothing is guessed” is withdrawn.

---

## 3. What “accepted” means

Every Fix in sections 1.1–1.11, 2.1–2.16, 3.1–3.13, 4.1–4.17, and the Top 5 is accepted as a **specification** defect or gap. Application of a Fix is one of:

- **applied in spec** — v0.4.1 text incorporates it;
- **deferred to product** — specified, labelled **specified / not built**, no application code written;
- **needs counsel** — legal/residency/retention;
- **needs source** — citation or figure cannot be verified from this tree.

See `AUDIT-v0.4-ACTIONS.md` for the per-ID map.

---

## 4. Code vs the audited PRD

The audit was written against a PRD that lagged this repo. Material disagreements (documented in the ACTIONS file and in v0.4.1 §15):

- Inventory, join API (`/api/join/redeem`, `/api/join/confirm`), dashboard, spreadsheet import, audit log, soft-delete, catalogue seed/review, amendment versions, and a write queue **exist in `app/`**.
- `firestore.rules` now gates patient **read** (`canViewPatients`), result-value **write** (`canEnterResults`), and approval/amendment (`canApproveResults`). The audit’s “1 of 4 SLIPTA rights” describes **v0.4’s claims vs the rules v0.4 described**, not necessarily this undeployed file. **Rules are still not deployed** (`DEPLOY-2026-08-21.md` Stage C).
- Multi-clinic membership (`clinicRoles` + `activeClinicId`) is built; owner acting clinic is session-only.
- `clinic_admin` cannot register a patient in code, but **can** import and soft-delete. v0.4.1 specifies moving import/soft-delete off `clinic_admin` (not implemented).

---

## 5. Live production (grounding)

From `DEPLOY-2026-08-21.md` (not re-verified in this task):

- Site: `https://labflow-six.vercel.app`
- Stage A merged; Stage B **`/api/health` is 503**; Stage C rules **not deployed**; Stage D Resend/cron **not started**.
- **No real patient names** until Stage C is green **and** (per this audit) residency counsel and a retention default exist.

---

*End of audit response.*
