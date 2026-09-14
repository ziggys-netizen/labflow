# S7 — Excel export and email (Resend)

**Date:** 21 August 2026  
**Branch:** `wip/inventory-and-migration`

Reports are built on the trusted server (`POST /api/reports/export`) and emailed with Resend. The browser never sees a mail API key.

## Limits

| Limit | Value | Why |
|---|---|---|
| Date range | **90 days inclusive** | Vercel route timeouts, PHI volume on an email attachment, and Firestore Spark read cost (a wide unfiltered pull can burn the daily quota). |
| Row cap | **8,000** | Same timeout / attachment / read reasons if a dense clinic still exceeds 90 days of volume. |
| Rate | **5 exports per user per hour** | `serverExportRateLimits/{uid}`, same hour-bucket pattern as join-code attempts. |

`lab_supervisor` is rejected (`canExportData` is false). Owner, clinic admin, and lab manager may export. Clinic is taken from the verified token / user record — a `clinicId` or recipient email in the body is ignored. Owner has no clinic claim; that account exports **all clinics**.

## Environment (server only)

Never prefix these with `NEXT_PUBLIC_`. They are read lazily at request time; a missing value returns **500** with a message naming both settings, not a build failure and not 503 (the mail service is not down; LabFlow lacks its settings). The check runs before the hourly export quota is used and before any clinical data is read.

| Variable | Purpose |
|---|---|
| `RESEND_API_KEY` | Resend API key |
| `RESEND_FROM` | Verified From address, e.g. `LabFlow Reports <reports@yourdomain>` |

In Resend: add the sending domain, publish the DNS records it shows, wait until the domain is **verified**, then set `RESEND_FROM` to an address on that domain. Until then, delivery fails. Resend returns 403 `validation_error` for an unverified domain, and for the `resend.dev` testing sender addressed to anyone but the Resend account owner; LabFlow shows a 502 explaining that, without echoing the owner's address (`describeResendFailure` in `app/lib/resendMail.ts`). Environment changes on Vercel apply only to a new deployment.

Firebase Admin credentials are unchanged (`docs/OIDC-SETUP.md`). Region stays `fra1` in `vercel.json`. Deploy the new Firestore indexes in `firestore.indexes.json` (`orders` + `resultsEnteredAt`, `inventoryMovements` + `occurredAt`) or the first clinic-scoped results/inventory export will fail until they exist.

## PHI

The spreadsheet is patient / order / result / inventory data. It is assembled on **Vercel** and handed to **Resend** for delivery. Both are processors of clinical data. Record them on the clinic’s data-protection register (sub-processors). Vercel and Resend are cross-border destinations under s.37 of the Bill as published by the National Assembly (not verified against the enacted 2025 text). Record each on the transfer assessment (PRD v0.5 §12.6–12.7). Do not assume the Act is in force; do not invent a localisation requirement.

The Firestore `nam7` destination has a factual seed (`app/lib/transferAssessments.ts`; brief [`TRANSFER-ASSESSMENT-FIRESTORE-NAM7-2026-08-23.md`](TRANSFER-ASSESSMENT-FIRESTORE-NAM7-2026-08-23.md)). `receivingCountryLawAssessment` is `PENDING LEGAL REVIEW`. Vercel `fra1` and Resend still need their own assessment records.

Audit action: `report.exported` (who, when, type, date range, row count, recipient).
