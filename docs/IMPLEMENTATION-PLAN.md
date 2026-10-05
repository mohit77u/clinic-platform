> **Status (Oct 2026):** Phases 1–6 are implemented in this repo — see `../README.md` for what exists and `runbook.md` for go-live. Deviations from this plan: TypeORM instead of Prisma; `@nestjs/schedule` cron instead of BullMQ; local-disk storage behind a `FileStorage` interface instead of S3/R2; no Docker Compose (local Postgres/Redis); no shared zod package.

# Clinic Platform — Implementation Plan

Companion to `MVP-SPEC.md` (v2). Spec says **what** to build; this says **in what order, how, and how we know each step is done**.

Team assumption: 2–3 developers. Timeline: **9 weeks** (8 from spec + 1 for admin-entered onboarding). One dev can do it in about 14–16 weeks.

---

## 1. Technical decisions (so nobody re-debates them mid-build)

| Area | Decision | Why |
|---|---|---|
| Repo | Monorepo: `frontend` (Next.js), `backend` (NestJS) | One place; API types are mirrored in `frontend/src/lib/types.ts` |
| Frontend | Next.js (App Router) + TypeScript + Tailwind + next-intl (Hindi/English) | SSR for SEO, i18n built in |
| Backend | NestJS + TypeScript, REST, zod/class-validator | Clear module structure for 3 roles |
| DB access | **TypeORM** entities + hand-written **SQL migrations**; raw SQL for token allocation | Partial unique indexes and row locks live in SQL migrations |
| DB | PostgreSQL 16 | Constraints and row locks do the booking safety |
| Cache/queue | Redis + BullMQ | OTP throttling, notifications, cron jobs |
| Auth | Mobile OTP → short-lived JWT in httpOnly cookie + refresh token | No passwords to manage |
| Files | S3-compatible bucket (Cloudflare R2 / S3) + `sharp` for resize to WebP | Light pages on mobile networks |
| Payments | Razorpay Orders + webhook | Standard in India |
| SMS / WhatsApp | MSG91 (DLT) / a WhatsApp BSP (Interakt, Wati or Gupshup) behind a `Notifier` interface | Swap providers without touching business code |
| Infra | Docker Compose for local; one VPS + managed Postgres backups for prod | Cheap and enough for Rewa scale |
| CI | GitHub/GitLab pipeline: lint, typecheck, unit + integration tests, migration check | Catch regressions on booking logic |
| Monitoring | Sentry + uptime ping | Know when booking breaks |

**Interfaces to define early** (so providers can be mocked in dev):
`Notifier` (sms/whatsapp/email), `FileStorage`, `PaymentGateway`, `Clock` (so cron/expiry logic is testable).

---

## 2. Repository layout

```
clinic-platform/
├─ apps/
│  ├─ api/
│  │  ├─ prisma/ (schema.prisma, migrations/, seed.ts)
│  │  └─ src/
│  │     ├─ auth/            # OTP, JWT, guards, roles
│  │     ├─ clinics/         # admin CRUD, images, public listing
│  │     ├─ doctors/         # doctors, schedules, leaves
│  │     ├─ booking/         # availability, token allocation, queue actions
│  │     ├─ subscriptions/   # plans, trial, sweeper, gating
│  │     ├─ payments/        # razorpay order, webhook, invoice PDF
│  │     ├─ notifications/   # templates, providers, logs, BullMQ jobs
│  │     ├─ admin/           # stats, settings, audit
│  │     └─ common/          # clock, storage, errors, pagination
│  └─ web/
│     └─ src/app/
│        ├─ (public)/        # home, search, clinic, doctor, book, queue, my-bookings
│        ├─ clinic/          # owner/staff panel
│        └─ admin/           # super admin panel
├─ packages/shared/          # zod schemas, enums, token/time helpers
├─ docker-compose.yml        # postgres, redis, minio, mailhog
├─ .env.example
└─ docs/ (MVP-SPEC.md, IMPLEMENTATION-PLAN.md, runbook.md)
```

---

## 3. Phase 0 — Start now, in parallel with coding (non-engineering, long lead time)

These block launch, not development. Do them in week 1 and chase weekly.

| Task | Owner | Lead time | Done when |
|---|---|---|---|
| Decide final brand name + domain | You | 1 day | Domain bought |
| SMS **DLT registration** (entity, sender ID, OTP + booking templates) | You | 3–15 days | Templates approved |
| WhatsApp Business verification + template approval | You | 3–10 days | Booking-confirm + reminder templates approved |
| Razorpay account (KYC, business docs) | You | 3–7 days | Live keys issued |
| Privacy policy + terms (DPDP-aware), clinic agreement | You | 3–5 days | Published pages |
| Collect first 5–10 clinic profiles (photos, doctors, timings, map links) | You | ongoing | Sheet of real data for seeding |

---

## 4. Build phases

Each phase ends with something demonstrable. Do not start the next phase until the **exit criteria** pass.

### Phase 1 — Foundation (Week 1)
**Tasks**
1. Monorepo scaffold, TypeScript, ESLint/Prettier, Husky, CI pipeline.
2. Docker Compose (Postgres, Redis, MinIO, Mailhog) + `.env.example`.
3. Prisma schema from the spec DDL; raw-SQL migration for enums, partial unique index `uq_active_patient_session`, and constraints; seed script (specializations, plans, app_settings, one super admin).
4. `common/` modules: `Clock`, error filter, config validation, logger, pagination.
5. Auth: `POST /auth/otp/send|verify`, OTP hashing, rate limits (3/hr per mobile, 10/day per IP via Redis), JWT cookie, refresh, `RolesGuard`, `ClinicScopeGuard` (staff can only touch their own clinic).
6. Notification **console provider** in dev (logs OTP to terminal).

**Exit criteria**
- `docker compose up` + `npm run dev` gives a running web + api from a fresh clone in under 10 minutes.
- Migrations apply cleanly on empty DB; seed creates 4 plans, settings, specializations.
- OTP login works for admin; role guards reject cross-clinic access (tests).

### Phase 2 — Admin: create & publish clinics (Weeks 2–3)
**Tasks**
1. Admin UI shell + layout, Hindi/English plumbing (`next-intl`).
2. Clinic CRUD: all fields incl. `map_url` validation (accepts `google.com/maps`, `maps.app.goo.gl`), `area` dropdown (Rewa localities list in a table so it is editable).
3. **Image upload pipeline:** signed upload → `sharp` resize (max 1600px, WebP, plus 400px thumb) → store → `clinic_images` rows; drag-to-reorder; cover image selection.
4. Doctor CRUD (photo, specialization, qualification, reg. no., fee, languages).
5. Schedule editor (weekday × session; mode token/slot; `slot_minutes`, `max_tokens`, `walkin_reserved`) with validation (no overlap on same weekday for same doctor) + leaves.
6. Owner/staff login creation (admin enters mobile → creates `users` + `clinic_members`).
7. **Publish** action: sets `approved`, creates trial subscription using `clinics.trial_days ?? app_settings.default_trial_days`, writes audit log.
8. Suspend / reactivate, manual extend/gift days (writes `gifted` subscription row + audit).

**Exit criteria**
- Admin can create a complete clinic with 3 images and 2 doctors with schedules in < 15 minutes, publish it, and see the trial end date.
- Overlapping schedules and bad map URLs are rejected with clear messages.
- Every state change appears in `audit_logs`.

### Phase 3 — Public discovery (Week 4)
**Tasks**
1. View/query `v_public_clinics` (approved + active subscription within grace) — **the only source for public endpoints**.
2. `GET /clinics`, `/clinics/:slug`, `/doctors/:slug`, `/specializations`, with filters (area, specialization, text search via `pg_trgm`, "available today").
3. Pages: Home/search, results, clinic page (cover, gallery carousel, doctors, timings, "Get directions" button), doctor page.
4. SEO: SSR, `generateMetadata`, `sitemap.xml`, `robots.txt`, JSON-LD (`Physician`/`MedicalClinic`), pretty URLs (`/rewa/<specialization>`).
5. Performance pass: image lazy-loading, `next/image`, page weight under 1.5 MB, Lighthouse mobile ≥ 85.

**Exit criteria**
- A clinic with an expired subscription never shows in search, direct URL (404/“not available”), or sitemap (test).
- Lighthouse mobile performance ≥ 85 and SEO ≥ 95 on the clinic page.

### Phase 4 — Booking & tokens (Weeks 5–6) ⚠️ highest-risk phase
**Tasks**
1. Availability endpoint: for doctor + date → sessions (respect weekday, leaves, advance-booking window, cut-off, capacity left, walk-in reserve).
2. **Token allocation service** (single transaction): upsert `token_counters`, `UPDATE … RETURNING`, capacity check, insert appointment; rely on `UNIQUE(schedule_id, visit_date, token_no)` as the safety net.
3. Booking API: OTP verify → patient profile get/create → one-active-booking-per-session rule → returns `public_id`, token, estimated time.
4. Patient pages: 3-step booking, confirmation, "My bookings", cancel (before cutoff).
5. **Live queue page** (`/q/:publicId`): shows `now_serving`, patients ahead, ETA; polls every 10–15 s.
6. Clinic panel: Today's Queue (mobile-first, big buttons): check-in, call next, skip, complete, no-show, cancel; **walk-in** form sharing the same counter; auto-refresh.
7. Doctor leave handling: mark affected bookings `cancelled_by_clinic`, enqueue notifications.
8. `no-show-closer` job after session end.

**Exit criteria (must all pass before moving on)**
- **Concurrency test:** 50 parallel booking requests for the last 1 token → exactly 1 success, 49 clean "session full", zero duplicate tokens.
- Online + walk-in mixed load → tokens strictly sequential with no gaps caused by races (gaps only from cancellations).
- Same patient double-booking same session is rejected.
- Cancelled tokens are never reused.
- Receptionist can run a 40-patient mock session on a mid-range Android phone without confusion (usability check with a real person).

### Phase 5 — Subscriptions & payments (Week 7)
**Tasks**
1. Plans API + admin plan editor.
2. Subscription service: `extend(clinic, plan)` — new `ends_at = max(current_end, now) + duration`; GST computation (price + 18%).
3. Razorpay: create order → checkout on clinic panel → **webhook** (`payment.captured`, signature verified, idempotent on `razorpay_payment_id`) → create `paid` subscription + invoice.
4. Invoice PDF with sequential numbering per financial year (`RCP/2026-27/0001`) — generated server-side, stored, downloadable.
5. `subscription-sweeper` (hourly): expire, hide after grace; `renewal-reminders` (7/3/1 days) via BullMQ.
6. Gating: booking endpoints refuse for expired clinics; dashboard banners for trial/expiring/grace/expired; clinic can always log in to renew.
7. Admin: payments list, revenue summary, manual override.

**Exit criteria**
- Replaying the same webhook 5× adds the plan duration exactly once.
- Renewing early extends from the existing end date (test with fake `Clock`).
- Trial → expired → renewed flow works end-to-end in a staging run using time travel.
- Invoice numbers have no gaps or duplicates under concurrent payments.

### Phase 6 — Notifications & hardening (Week 8)
**Tasks**
1. Real providers behind `Notifier`: MSG91 (OTP/SMS), WhatsApp BSP (confirmation, 2-hr reminder, "your turn is near", cancellation); SMS fallback when WhatsApp fails.
2. Template registry with Hindi + English text; `notification_logs` for every send, retry with backoff.
3. "Turn is near" trigger when `now_serving` ≥ token − 2.
4. Security pass: rate limits, CORS, helmet, CSRF for cookie auth, upload type/size checks, signed URLs for documents, authorisation tests per endpoint, dependency audit.
5. Privacy: consent checkbox at booking, privacy page, data export/delete request path for patients, admin-only access to documents.
6. Backups (daily) + one restore drill; Sentry; uptime check; log retention.

**Exit criteria**
- OTP and booking confirmations delivered on real phones (Airtel, Jio, Vi).
- Penetration-style checklist passes: patient cannot read another patient's data; clinic A cannot read clinic B; staff cannot see billing.
- A DB restore from backup has been done once successfully.

### Phase 7 — Pilot & launch (Week 9, then ongoing)
**Tasks**
1. Production deploy (VPS, reverse proxy + TLS, env secrets, migration pipeline, rollback plan).
2. Admin enters 10–15 pilot clinics (3-month trial override for the first batch).
3. Print QR posters per clinic (link to the clinic's page); train receptionists (15-minute walkthrough + Hindi one-page guide).
4. Daily check during the first 2 weeks: failed notifications, booking errors, empty sessions, feedback calls to owners.
5. Fix list triage → weekly release cadence.

**Exit criteria / success metrics (first 60 days)**
- ≥ 10 clinics live; ≥ 50% of them use the queue screen daily.
- ≥ 300 online bookings in the pilot; < 15% no-show rate.
- ≥ 3 clinics say they would pay; at least 1 converts to a paid plan at trial end.
- Zero double-token incidents.

---

## 5. Week-by-week schedule (2–3 devs)

| Week | Dev A (backend) | Dev B (frontend) | You (non-code) |
|---|---|---|---|
| 1 | Foundation, DB, auth | Web scaffold, i18n, layout | Phase 0: name, DLT, WhatsApp, Razorpay |
| 2 | Clinic/doctor/schedule APIs | Admin forms | Collect real clinic data |
| 3 | Images, publish/trial, audit | Image uploader, schedule editor | Review admin UX with 1 clinic |
| 4 | Public APIs + view, search | Public pages + SEO | Write Hindi copy |
| 5 | Availability + token allocation + tests | Booking flow UI | — |
| 6 | Queue actions, leaves, no-show job | Queue screen, live queue page | Usability test with a receptionist |
| 7 | Razorpay, webhook, invoices, sweeper | Subscription UI, banners | Confirm GST details for invoices |
| 8 | Notifications, security, backups | i18n polish, perf, a11y | Poster design, onboarding guide |
| 9 | Deploy, monitoring, hotfixes | Pilot support | Onboard pilot clinics |

---

## 6. Testing strategy

| Level | What | Tooling |
|---|---|---|
| Unit | Token math, ETA calc, GST calc, subscription date logic, availability rules | Vitest/Jest + fake `Clock` |
| Integration | API + real Postgres/Redis in Docker per CI run | Supertest + Testcontainers |
| **Concurrency** | 50-way parallel booking, webhook replay, parallel invoice numbering | Custom script in integration suite |
| E2E | Admin publishes clinic → patient books → clinic completes → subscription expires → hidden | Playwright |
| Manual | Real devices, 3G throttling, Hindi rendering, receptionist walkthrough | Checklist in `docs/` |

Rule: **no merge to main** without green CI; booking and subscription modules require tests for every rule listed in the spec.

---

## 7. Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| DLT / WhatsApp approvals delayed | Can't send OTP → can't launch | Start in week 1; dev uses console provider; keep email-OTP as a temporary fallback for admin only |
| Race condition in tokens | Duplicate/wrong tokens destroy trust | Row-locked counter + unique constraint + concurrency test gate in Phase 4 |
| Clinics don't use the queue screen | No value → no renewals | Admin-assisted onboarding, 15-min training, poster, first-2-weeks daily check-ins |
| Low patient traffic early | Clinics see no benefit | Local SEO, QR posters, Google Business profiles, WhatsApp groups; show them numbers at day 45 |
| Annual ₹9,999 too high for small clinics | Low conversion | Keep monthly/quarterly; test price in pilot; consider limited-time launch discount |
| Poor connectivity at clinics | Queue screen fails | Light pages, retry/auto-reconnect, offline-tolerant UI states |
| Scope creep (prescriptions, billing, apps) | Delays launch | Non-goals list in spec; new ideas go to a Phase 2 backlog |
| Data privacy complaints | Legal/trust risk | Minimal data, consent, access controls, privacy policy, no medical records in MVP |
| Single VPS failure | Downtime | Daily backups, restore drill, documented redeploy, uptime alerts |

---

## 8. Definition of Done (per task)
1. Code merged via reviewed PR, CI green.
2. Tests for the rule(s) it implements.
3. Hindi + English strings added (no hard-coded text).
4. Works at 360 px width on a throttled connection.
5. Audit log / error handling in place where state changes.
6. Docs updated (`docs/runbook.md` for anything ops-related).

---

## 9. Phase 2 backlog (after pilot, not in this plan)
Pathology / diagnostic centres (sonography, ECG, blood tests) via `services` + report upload · online consultation-fee payment · clinic self-signup with review · reviews and ratings · prescriptions/EMR · mobile apps (PWA first) · ABDM/ABHA · multi-branch · analytics for clinic owners · referral program.

---

## 10. Immediate next actions (this week)
1. Pick final name → buy domain.
2. Start DLT + WhatsApp + Razorpay applications.
3. Confirm who the developers are and the repo host (GitLab or GitHub).
4. Approve this plan → I scaffold the monorepo, Docker Compose, Prisma schema + migrations + seed (Phase 1).
