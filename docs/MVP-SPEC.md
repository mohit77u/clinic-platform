# Clinic Platform — MVP Spec & Database Design

Status: Draft v2 · Launch city: Rewa, Madhya Pradesh · Scope: doctors' clinics only (no hospitals yet)

## Decisions locked in (v2)
- **Working name:** Clinic Platform (swasthya = health). Easy to rename later; nothing in the schema depends on it.
- **Plans (GST extra, see 7.2):** Monthly ₹1,199 · Quarterly ₹2,999 · Half-yearly ₹5,499 · **Annual ₹9,999** (≈ ₹833/month, ~30% cheaper than monthly). Prices live in the `plans` table, so they are editable from admin without code changes.
- **Trial length is dynamic:** global default = 1 month (30 days) in `app_settings`; admin can override per clinic at approval time or later.
- **Patients pay nothing online.** Consultation fee is only displayed; paid at the clinic.
- **Clinic data is entered by admin** (you/your team), including Google Maps URL and clinic images. Self-signup is deferred; the owner only gets a login to run the queue and see the subscription.
- **Stack:** Next.js + Node.js + PostgreSQL (+ Redis), as proposed.

---

## 1. Product summary

A two-sided platform:

- **Clinics / doctors (paying customers):** register, get a free trial, then subscribe (monthly / half-yearly / annual) to stay listed and use the booking + token system.
- **Patients (public, free):** search clinics in Rewa, book an appointment, receive a token number, track the queue live.
- **Super Admin (you):** approve clinics, manage plans and subscriptions, see revenue.

### Goals of the MVP
1. A patient can find a Rewa doctor and book a token in under 1 minute, without installing an app.
2. A clinic can set up in under 10 minutes and run its daily queue from a phone or laptop.
3. Subscription lifecycle (trial → paid → expired → hidden) runs automatically.

### Non-goals (explicitly NOT in MVP)
Prescriptions / EMR, billing & pharmacy, video consults, hospitals / IPD, multi-branch chains, mobile apps, ABDM/ABHA, reviews & ratings, pathology/diagnostic centres (designed for, built in Phase 2).

---

## 2. Users and roles

| Role | Who | Access |
|---|---|---|
| `super_admin` | You / your team | Everything |
| `clinic_owner` | Doctor or clinic owner | Own clinic, its doctors, schedules, queue, subscription |
| `clinic_staff` | Receptionist | Queue + walk-in booking only (no billing/plan access) |
| `patient` | Public | Own bookings (login by mobile OTP, no password) |

Patients book with mobile + OTP. One mobile number can hold several patient profiles (family members).

---

## 3. Core user flows

### 3.1 Clinic onboarding (admin-assisted)
1. Admin visits/calls the clinic, collects details, then creates the clinic in the admin panel: name, address, area, phone, **Google Maps URL**, registration no., **multiple clinic images** (cover + gallery), and the doctors (name, specialization, qualification, fee, photo, MP Medical Council reg. no.).
2. Admin sets each doctor's schedule (days, sessions, token/slot settings) — or the owner does it later from their panel.
3. Admin creates the **owner login** (mobile number → OTP login) and optionally a receptionist login.
4. Admin sets **trial length** (defaults to the global setting, 1 month; override per clinic) and clicks **Publish**. Clinic status becomes `approved`, the trial subscription starts, and the clinic appears in public listing.
5. Optional documents (registration / licence) can be uploaded for the admin's own verification record; they are never shown publicly.
6. Owner logs in, can edit schedules, leaves, and run the queue. Profile/image edits by the owner are allowed but optional.

> Later (Phase 2): self-signup for clinics with an `pending → approved` review, which the schema already supports.

### 3.2 Patient booking
1. Visit site → search (specialization / doctor / clinic name / area) → open clinic/doctor page.
2. Pick date → pick session or slot → enter mobile → OTP verify → choose/add patient (name, age, gender) → confirm.
3. System allots the **token number** (and slot time if slot mode) → shows confirmation page + sends WhatsApp/SMS.
4. Patient can open a **live queue link**: "Now serving #7 · Your token #12 · ~35 min".
5. Cancel/reschedule via link until X minutes before the session (configurable).

### 3.3 Clinic daily operation
1. Open "Today's Queue" for a doctor/session: list of tokens with patient name, age, status.
2. Actions: **Check-in**, **Call Next**, **Skip**, **Complete**, **No-show**, **Cancel**.
3. **Walk-in:** receptionist adds patient → system issues the next token (same counter, so online + walk-in tokens never clash).
4. Mark doctor unavailable / on leave for a date → existing bookings flagged and patients notified.

### 3.4 Subscription lifecycle
```
approved → TRIAL (1–3 mo) → ACTIVE (paid) → EXPIRING (reminders) → GRACE (3 days) → EXPIRED
                                      ↑___________ renew (any time) ___________|
```
- Reminders at 7, 3, 1 day before end, and on expiry (SMS/WhatsApp + email + dashboard banner).
- During **grace**: still visible, banner warns owner.
- **EXPIRED**: hidden from public search, new bookings blocked, existing future bookings are honoured/cancelled per setting. Clinic can still log in, see data, and renew. Data is never deleted on expiry.
- Renewal while active **extends from current end date**, not from today.

---

## 4. Functional requirements

### 4.1 Public site (patient)
- Home: search box (specialization / doctor / clinic), area filter (Rewa localities), "Available today" toggle.
- Search results: cards with doctor photo, specialization, clinic, fee, next available slot.
- Clinic page: details, doctors, timings, address + map link, phone.
- Doctor page: bio, qualification, experience, fee, languages, schedule, **Book** button.
- Booking flow + OTP + confirmation page.
- "My bookings": by mobile + OTP; upcoming/past; cancel/reschedule.
- Live queue page (public link per appointment, no login).
- SEO: server-rendered pages, clean URLs (`/rewa/dermatologist`, `/clinic/<slug>`), schema.org markup. Rewa-specific content helps ranking.
- Languages: Hindi + English toggle (important for Rewa).

### 4.2 Clinic panel
- Dashboard: today's appointments, tokens served, subscription status + days left.
- Profile editor (clinic + doctors).
- Schedule manager (weekly pattern, sessions, slot duration, max tokens, leaves/holidays).
- Queue screen (large buttons, mobile-first, auto-refresh).
- Walk-in booking.
- Appointment history with filters; CSV export.
- Subscription page: current plan, expiry, **Renew / Upgrade** (Razorpay), invoices.
- Staff accounts (receptionist role).

### 4.3 Super admin panel
- Clinic approval queue (view docs, approve/reject with reason).
- Clinics list (status, plan, expiry, last activity); suspend/reactivate.
- Plans CRUD (name, duration, price, active).
- Global settings: trial length, grace days, cancellation window, booking window (how many days ahead).
- Manual subscription override (extend/gift days — useful for onboarding in person).
- Payments list + invoices.
- Dashboard: active/trial/expired clinics, MRR, bookings per day, top specializations.
- Audit log.

### 4.4 Token & scheduling rules
- Each schedule row = one **session** (e.g. Mon–Sat, 10:00–13:00, "Morning").
- `booking_mode`:
  - `token` — sequential tokens per doctor/date/session up to `max_tokens`; estimated time = start + (token−1) × avg_minutes.
  - `slot` — fixed slots (`slot_minutes`), each slot capacity 1 (or N); token number = slot order.
- Token counter resets per (doctor, date, session).
- Walk-in and online share one counter. Optional: reserve N tokens for walk-ins (`walkin_reserved`).
- Booking cut-off: online booking closes `cutoff_minutes` before session end (default 0 = until session ends).
- Max advance booking: default 7 days (setting).
- Cancelled token numbers are **not reused** (keeps numbering stable for patients already told their number).
- Double-booking protection: DB unique constraint + transactional counter increment.
- Same patient cannot hold two active bookings with the same doctor on the same date/session.
- Doctor leave: bookings on that date/session are auto-flagged `cancelled_by_clinic`, patient notified.

### 4.5 Notifications
| Event | Channel |
|---|---|
| OTP | SMS |
| Booking confirmed (token, time, address) | WhatsApp (SMS fallback) |
| Reminder 2 hrs before session | WhatsApp/SMS |
| "Your turn is near" (when current token = yours − 2) | WhatsApp/SMS |
| Cancelled by clinic | WhatsApp/SMS |
| Clinic: trial ending / renewal reminders / payment receipt | WhatsApp + email |
| Admin: new clinic pending approval | Email |

All sends logged in `notification_logs`.

### 4.6 Payments
- Razorpay Orders + Checkout for subscription payments. Verify via webhook (`payment.captured`), never trust the client callback alone.
- GST invoice PDF per payment (sequential invoice numbers).
- **Patients pay nothing online in MVP** — consultation fee is displayed and paid at the clinic. (Online fee payment = Phase 2; adds settlement/refund complexity.)

---

## 5. Non-functional requirements
- **Mobile-first**: most Rewa users and receptionists will be on low-end Android. Pages < 1.5 MB, usable on 3G.
- **Security**: OTP rate limiting (e.g. 3/hr per mobile, 10/day per IP), JWT/session cookies (httpOnly), role checks on every endpoint, input validation, signed upload URLs, HTTPS only.
- **Privacy (DPDP Act)**: collect minimum patient data (name, age, gender, mobile); consent checkbox at booking; clinic sees only its own patients; privacy policy + terms; no medical records in MVP.
- **Reliability**: daily DB backups, uptime monitoring, error tracking (Sentry).
- **Time zone**: store UTC, display IST; all "session" logic uses `Asia/Kolkata` dates.
- **Audit**: log subscription changes, approvals, admin overrides.

---

## 6. Suggested tech stack
| Layer | Choice |
|---|---|
| Frontend | Next.js (React) + Tailwind — SSR for SEO, one codebase for public site + panels |
| Backend | Node.js (NestJS or Express) — or Laravel/Django if that's your strength |
| Database | PostgreSQL |
| Cache / queue / OTP throttle | Redis (+ BullMQ for notification & cron jobs) |
| Files | S3-compatible storage (photos, documents) |
| Payments | Razorpay |
| SMS/OTP | MSG91 (DLT-registered templates required in India) |
| WhatsApp | WhatsApp Business API via a BSP (Gupshup / Interakt / Wati) |
| Hosting | Single VPS / small cloud to start (DigitalOcean/Hetzner/AWS Lightsail) |
| Live queue | Polling every 10–15 s for MVP; WebSocket/SSE later |

> India-specific prerequisite: SMS needs **DLT registration** (entity + templates) and WhatsApp needs a verified business account. Start these in week 1 — they take days to weeks.

---

## 7. Database design (PostgreSQL)

### 7.1 ER overview
```
users 1─┬─* clinic_members *─1 clinics 1─* clinic_documents
        │                         │
        │                         ├─* doctors *─1 specializations
        │                         │      ├─* doctor_schedules
        │                         │      └─* doctor_leaves
        │                         ├─* subscriptions *─1 plans
        │                         │        └─* payments
        └─* patients (profiles) ──┴─* appointments *─1 doctors
                                          └─ token_counters (per doctor/date/schedule)
```

### 7.2 Tables (DDL)

```sql
-- ===== Enums =====
CREATE TYPE user_role AS ENUM ('super_admin','clinic_owner','clinic_staff','patient');
CREATE TYPE provider_type AS ENUM ('clinic','diagnostic_centre');      -- diagnostic_centre = Phase 2
CREATE TYPE clinic_status AS ENUM ('pending','approved','rejected','suspended');
CREATE TYPE booking_mode AS ENUM ('token','slot');
CREATE TYPE appointment_status AS ENUM
  ('booked','checked_in','in_consultation','completed','cancelled_by_patient','cancelled_by_clinic','no_show','skipped');
CREATE TYPE appointment_source AS ENUM ('online','walkin');
CREATE TYPE subscription_kind AS ENUM ('trial','paid','gifted');
CREATE TYPE subscription_status AS ENUM ('active','expired','cancelled');
CREATE TYPE payment_status AS ENUM ('created','captured','failed','refunded');

-- ===== Identity =====
CREATE TABLE users (
  id            BIGSERIAL PRIMARY KEY,
  role          user_role NOT NULL,
  name          TEXT,
  mobile        VARCHAR(15) NOT NULL UNIQUE,         -- E.164 without '+', login identity
  email         TEXT UNIQUE,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE otp_requests (
  id          BIGSERIAL PRIMARY KEY,
  mobile      VARCHAR(15) NOT NULL,
  code_hash   TEXT NOT NULL,                          -- never store raw OTP
  purpose     TEXT NOT NULL,                          -- login | booking
  expires_at  TIMESTAMPTZ NOT NULL,
  attempts    SMALLINT NOT NULL DEFAULT 0,
  consumed_at TIMESTAMPTZ,
  ip          INET,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON otp_requests (mobile, created_at DESC);

-- ===== Clinics =====
CREATE TABLE clinics (
  id               BIGSERIAL PRIMARY KEY,
  type             provider_type NOT NULL DEFAULT 'clinic',
  name             TEXT NOT NULL,
  slug             TEXT NOT NULL UNIQUE,
  description      TEXT,
  phone            VARCHAR(15) NOT NULL,
  whatsapp         VARCHAR(15),
  email            TEXT,
  address_line     TEXT NOT NULL,
  area             TEXT NOT NULL,                     -- locality in Rewa (filter)
  city             TEXT NOT NULL DEFAULT 'Rewa',
  state            TEXT NOT NULL DEFAULT 'Madhya Pradesh',
  pincode          VARCHAR(6),
  map_url          TEXT,                              -- Google Maps share link (shown as "Get directions")
  latitude         NUMERIC(9,6),                      -- optional, for future "near me" sorting
  longitude        NUMERIC(9,6),
  registration_no  TEXT,                              -- clinic/establishment reg.
  logo_url         TEXT,
  cover_url        TEXT,
  trial_days       SMALLINT,                          -- per-clinic trial override; NULL = use app_settings.default_trial_days
  created_by       BIGINT REFERENCES users(id),       -- admin who entered it
  status           clinic_status NOT NULL DEFAULT 'pending',
  rejection_reason TEXT,
  approved_at      TIMESTAMPTZ,
  approved_by      BIGINT REFERENCES users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON clinics (city, area) WHERE status = 'approved';

CREATE TABLE clinic_members (                          -- who may manage which clinic
  clinic_id BIGINT NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  user_id   BIGINT NOT NULL REFERENCES users(id),
  role      user_role NOT NULL CHECK (role IN ('clinic_owner','clinic_staff')),
  PRIMARY KEY (clinic_id, user_id)
);

CREATE TABLE clinic_documents (
  id          BIGSERIAL PRIMARY KEY,
  clinic_id   BIGINT NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  doc_type    TEXT NOT NULL,                          -- clinic_registration | doctor_licence | id_proof
  file_url    TEXT NOT NULL,
  verified    BOOLEAN NOT NULL DEFAULT FALSE,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE clinic_images (                           -- gallery shown on clinic page
  id         BIGSERIAL PRIMARY KEY,
  clinic_id  BIGINT NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  image_url  TEXT NOT NULL,
  caption    TEXT,
  sort_order SMALLINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON clinic_images (clinic_id, sort_order);

-- ===== Doctors =====
CREATE TABLE specializations (
  id      SERIAL PRIMARY KEY,
  name    TEXT NOT NULL UNIQUE,                       -- Physician, Pediatrician, Gynecologist...
  name_hi TEXT,
  slug    TEXT NOT NULL UNIQUE
);

CREATE TABLE doctors (
  id                BIGSERIAL PRIMARY KEY,
  clinic_id         BIGINT NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  specialization_id INT NOT NULL REFERENCES specializations(id),
  name              TEXT NOT NULL,
  slug              TEXT NOT NULL UNIQUE,
  qualification     TEXT,                             -- MBBS, MD (Medicine)
  experience_years  SMALLINT,
  medical_reg_no    TEXT,                             -- MP Medical Council no.
  consultation_fee  NUMERIC(8,2),
  languages         TEXT[] DEFAULT '{}',
  bio               TEXT,
  photo_url         TEXT,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON doctors (clinic_id);
CREATE INDEX ON doctors (specialization_id) WHERE is_active;

-- One row = one session pattern (e.g. Mon-Sat morning)
CREATE TABLE doctor_schedules (
  id                BIGSERIAL PRIMARY KEY,
  doctor_id         BIGINT NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  weekday           SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6),   -- 0=Sun
  session_name      TEXT NOT NULL DEFAULT 'Session',                      -- Morning / Evening
  start_time        TIME NOT NULL,
  end_time          TIME NOT NULL CHECK (end_time > start_time),
  mode              booking_mode NOT NULL DEFAULT 'token',
  slot_minutes      SMALLINT,                         -- slot mode, or avg minutes/patient in token mode
  max_tokens        SMALLINT NOT NULL,                -- capacity per session
  walkin_reserved   SMALLINT NOT NULL DEFAULT 0,      -- tokens kept for walk-ins
  is_active         BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE INDEX ON doctor_schedules (doctor_id, weekday) WHERE is_active;

CREATE TABLE doctor_leaves (
  id          BIGSERIAL PRIMARY KEY,
  doctor_id   BIGINT NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  leave_date  DATE NOT NULL,
  schedule_id BIGINT REFERENCES doctor_schedules(id),   -- NULL = whole day
  reason      TEXT,
  UNIQUE (doctor_id, leave_date, schedule_id)
);

-- ===== Patients & appointments =====
CREATE TABLE patients (                                -- profiles under a mobile-account
  id         BIGSERIAL PRIMARY KEY,
  user_id    BIGINT NOT NULL REFERENCES users(id),     -- the account owner (role=patient)
  name       TEXT NOT NULL,
  age        SMALLINT,
  gender     CHAR(1) CHECK (gender IN ('M','F','O')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON patients (user_id);

-- Atomic token allocation: lock this row, increment, insert appointment in same txn
CREATE TABLE token_counters (
  schedule_id BIGINT NOT NULL REFERENCES doctor_schedules(id),
  visit_date  DATE   NOT NULL,
  last_token  INT    NOT NULL DEFAULT 0,
  now_serving INT    NOT NULL DEFAULT 0,               -- drives live queue display
  PRIMARY KEY (schedule_id, visit_date)
);

CREATE TABLE appointments (
  id              BIGSERIAL PRIMARY KEY,
  public_id       UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,   -- used in public queue link
  clinic_id       BIGINT NOT NULL REFERENCES clinics(id),
  doctor_id       BIGINT NOT NULL REFERENCES doctors(id),
  schedule_id     BIGINT NOT NULL REFERENCES doctor_schedules(id),
  patient_id      BIGINT NOT NULL REFERENCES patients(id),
  visit_date      DATE NOT NULL,
  token_no        INT  NOT NULL,
  slot_time       TIME,                                -- slot mode / estimated time in token mode
  status          appointment_status NOT NULL DEFAULT 'booked',
  source          appointment_source NOT NULL DEFAULT 'online',
  fee_amount      NUMERIC(8,2),                        -- snapshot of fee at booking
  notes           TEXT,
  cancelled_reason TEXT,
  checked_in_at   TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (schedule_id, visit_date, token_no)           -- no duplicate tokens, ever
);
-- one active booking per patient per doctor-session-day
CREATE UNIQUE INDEX uq_active_patient_session
  ON appointments (patient_id, schedule_id, visit_date)
  WHERE status IN ('booked','checked_in','in_consultation');
CREATE INDEX ON appointments (clinic_id, visit_date, status);
CREATE INDEX ON appointments (doctor_id, visit_date);

-- ===== Subscriptions & payments =====
CREATE TABLE plans (
  id              SERIAL PRIMARY KEY,
  name            TEXT NOT NULL,                       -- Monthly / Half-Yearly / Annual
  duration_months SMALLINT NOT NULL,                   -- 1 / 6 / 12
  price           NUMERIC(10,2) NOT NULL,
  gst_percent     NUMERIC(4,2) NOT NULL DEFAULT 18,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order      SMALLINT NOT NULL DEFAULT 0
);

CREATE TABLE subscriptions (
  id         BIGSERIAL PRIMARY KEY,
  clinic_id  BIGINT NOT NULL REFERENCES clinics(id),
  plan_id    INT REFERENCES plans(id),                 -- NULL for trial/gifted
  kind       subscription_kind NOT NULL,
  starts_at  TIMESTAMPTZ NOT NULL,
  ends_at    TIMESTAMPTZ NOT NULL CHECK (ends_at > starts_at),
  status     subscription_status NOT NULL DEFAULT 'active',
  created_by BIGINT REFERENCES users(id),              -- admin for gifted/manual
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON subscriptions (clinic_id, ends_at DESC);

CREATE TABLE payments (
  id                  BIGSERIAL PRIMARY KEY,
  clinic_id           BIGINT NOT NULL REFERENCES clinics(id),
  subscription_id     BIGINT REFERENCES subscriptions(id),
  plan_id             INT NOT NULL REFERENCES plans(id),
  amount              NUMERIC(10,2) NOT NULL,          -- incl. GST
  gst_amount          NUMERIC(10,2) NOT NULL,
  status              payment_status NOT NULL DEFAULT 'created',
  razorpay_order_id   TEXT UNIQUE,
  razorpay_payment_id TEXT UNIQUE,
  invoice_no          TEXT UNIQUE,                     -- e.g. RCP/2026-27/0001
  invoice_url         TEXT,
  paid_at             TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ===== Platform =====
CREATE TABLE app_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- ===== Seed data =====
INSERT INTO app_settings (key, value) VALUES
  ('default_trial_days', '30'),            -- dynamic: admin can change; clinics.trial_days overrides per clinic
  ('grace_days', '3'),
  ('advance_booking_days', '7'),
  ('cancel_cutoff_minutes', '60');

-- price = base price excl. GST; GST 18% is added at checkout and shown on the invoice
INSERT INTO plans (name, duration_months, price, sort_order) VALUES
  ('Monthly',      1,  1199, 1),
  ('Quarterly',    3,  2999, 2),             -- ~17% cheaper than 3 x monthly
  ('Half-Yearly',  6,  5499, 3),             -- ~24% cheaper
  ('Annual',      12,  9999, 4);             -- ~30% cheaper, best value

CREATE TABLE notification_logs (
  id          BIGSERIAL PRIMARY KEY,
  channel     TEXT NOT NULL,                           -- sms | whatsapp | email
  to_address  TEXT NOT NULL,
  template    TEXT NOT NULL,
  payload     JSONB,
  status      TEXT NOT NULL DEFAULT 'queued',          -- queued | sent | failed
  error       TEXT,
  related_appointment_id BIGINT REFERENCES appointments(id),
  related_clinic_id      BIGINT REFERENCES clinics(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE audit_logs (
  id         BIGSERIAL PRIMARY KEY,
  actor_id   BIGINT REFERENCES users(id),
  action     TEXT NOT NULL,                            -- clinic.approved, subscription.extended ...
  entity     TEXT NOT NULL,
  entity_id  BIGINT,
  details    JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 7.3 Key queries / logic

**Is a clinic publicly visible?**
```sql
SELECT c.* FROM clinics c
WHERE c.status = 'approved'
  AND EXISTS (
    SELECT 1 FROM subscriptions s
    WHERE s.clinic_id = c.id AND s.status = 'active'
      AND s.ends_at + make_interval(days => :grace_days) > now()
  );
```
Create this as a view (`v_public_clinics`) so every public query goes through it.

**Atomic token allocation (inside one transaction):**
```sql
BEGIN;
-- ensure counter row exists
INSERT INTO token_counters (schedule_id, visit_date) VALUES (:sid, :date)
  ON CONFLICT DO NOTHING;
-- lock + increment
UPDATE token_counters SET last_token = last_token + 1
  WHERE schedule_id = :sid AND visit_date = :date
  RETURNING last_token;                  -- = new token_no
-- application checks: token_no <= max_tokens - walkin_reserved (for online), else ROLLBACK -> "Session full"
INSERT INTO appointments (..., token_no) VALUES (..., :token_no);
COMMIT;
```
The `UNIQUE (schedule_id, visit_date, token_no)` constraint is the safety net if anything goes wrong.

**Estimated time (token mode):** `start_time + (token_no − 1) × slot_minutes`, shown as "approx."; recalculated live from `now_serving`.

### 7.4 Scheduled jobs (cron / BullMQ)
| Job | Frequency | Action |
|---|---|---|
| `subscription-sweeper` | hourly | mark `ends_at < now()` as `expired`; hide clinic after grace |
| `renewal-reminders` | daily 9 AM | 7/3/1-day reminders to owners |
| `appointment-reminders` | every 15 min | 2-hr-before reminders |
| `otp-cleanup` | daily | delete expired OTP rows |
| `no-show-closer` | after session end | mark leftover `booked` as `no_show` |

### 7.5 Designed-for-later: pathology / diagnostic centres
The schema is ready for Phase 2 without rework:
- `clinics.type = 'diagnostic_centre'` reuses registration, subscription, listing, and panels.
- Add `services` (id, clinic_id, name e.g. "Sonography", "ECG", "CBC", category, price, prep_instructions, duration_minutes, home_collection BOOLEAN) and `service_schedules`.
- Appointments get a nullable `service_id` (doctor_id becomes nullable, with a CHECK that one of them is set).
- Add test **packages**, **report upload** (PDF per appointment) and **home sample collection** later.

---

## 8. API outline (REST)

**Auth:** `POST /auth/otp/send` · `POST /auth/otp/verify` · `POST /auth/logout`

**Public:**
`GET /clinics?area=&specialization=&q=` · `GET /clinics/:slug` · `GET /doctors/:slug` · `GET /doctors/:id/availability?date=` · `POST /appointments` · `GET /appointments/:publicId` (queue status) · `POST /appointments/:publicId/cancel` · `GET /me/appointments` · `GET /specializations`

**Clinic panel:**
`POST /clinics` (register) · `PATCH /clinics/:id` · `POST /clinics/:id/documents` · `CRUD /clinics/:id/doctors` · `CRUD /doctors/:id/schedules` · `CRUD /doctors/:id/leaves` · `GET /clinics/:id/queue?doctor=&date=&session=` · `POST /appointments/walkin` · `POST /appointments/:id/{checkin|call|skip|complete|no-show}` · `GET /clinics/:id/subscription` · `POST /clinics/:id/subscription/order` · `GET /clinics/:id/invoices`

**Admin:**
`GET /admin/clinics?status=` · `POST /admin/clinics/:id/{approve|reject|suspend|reactivate}` · `CRUD /admin/plans` · `POST /admin/clinics/:id/subscription/extend` · `GET/PUT /admin/settings` · `GET /admin/payments` · `GET /admin/stats`

**Webhook:** `POST /webhooks/razorpay` (signature verified, idempotent on `razorpay_payment_id`)

---

## 9. Screens list (for design/estimation)

**Public (8):** Home/search · Results · Clinic page · Doctor page · Booking (3 steps) · Confirmation · Live queue · My bookings
**Clinic (8):** Login · Registration wizard · Dashboard · Doctor & profile editor · Schedule manager · Today's queue · Walk-in · Subscription & invoices
**Admin (7):** Dashboard · Approval queue · Clinic detail · Clinics list · Plans · Settings · Payments

---

## 10. Build plan (small team of 2–3, ~8 weeks)

| Week | Deliverable |
|---|---|
| 0 (parallel, start now) | DLT registration, WhatsApp Business account, Razorpay account, domain, design of logo/brand |
| 1 | Project setup, DB migrations, auth (OTP), roles |
| 2 | Clinic registration, doctors, schedules, admin approval |
| 3 | Public listing + search + clinic/doctor pages (SEO) |
| 4 | Booking flow + token allocation + confirmation |
| 5 | Clinic queue screen + walk-in + live queue page |
| 6 | Plans, trial, Razorpay, webhook, invoices, subscription gating |
| 7 | Notifications (SMS/WhatsApp), cron jobs, Hindi translations |
| 8 | Testing (concurrent booking test!), security pass, pilot with 3–5 clinics, fixes |

### Must-have tests
- 50 concurrent bookings for the last token → exactly one succeeds, no duplicates.
- Subscription expiry hides clinic and blocks booking; renewal restores it.
- Razorpay webhook replay doesn't double-extend a subscription.
- Doctor leave cancels and notifies correctly.
- OTP brute-force and rate-limit checks.

---

## 11. Rewa go-to-market (ties directly into the product)

1. **Pre-launch (before building is done):** visit 25–30 clinics in person, show a clickable prototype, collect profile info, and promise a free 3-month trial. Ask which problems they have with waiting-room crowd and phone bookings.
2. **Pilot:** go live with 10–15 clinics across a few areas (Civil Lines, Dhoomanganj, Shiv Nagar, etc. — verify actual localities).
3. **Patient demand:** QR code poster in each clinic ("Book your token online"), Google Business profiles, local WhatsApp groups, SEO pages "doctors in Rewa".
4. **Convert:** at day 60 of trial, show the owner their numbers (bookings, no-shows reduced) before asking for payment.
5. **Phase 2 (months 3–6):** add pathology/diagnostic centres (sonography, ECG, blood tests), since one lab visit often follows a doctor visit — good cross-sell.

---

## 12. Decisions

**Resolved (v2):** name (working), plan prices, dynamic trial (default 1 month), patients pay nothing, admin-entered clinic data with map URL + images, same tech stack.

**Still open (defaults assumed, change anytime):**
1. **Default booking mode:** token (suits most OPDs); slot mode optional per doctor.
2. **Walk-in reserved tokens:** default 30% of `max_tokens`.
3. **UI language:** Hindi + English toggle, Hindi default for patients.
4. **Final brand name + domain** before WhatsApp/SMS template registration (templates carry the brand name, so decide before DLT submission).
5. **Pricing check:** validate ₹9,999/yr with 10 clinic owners in Rewa during the free pilot. The annual plan is a strong ask for a small clinic; a quarterly or monthly option lowers the entry barrier.

## 13. Admin-entered onboarding: what changes in the build
- The **admin panel becomes the main data-entry tool**, so it needs: clinic form with image upload (multi-image, drag to reorder), doctor form, schedule editor, owner-login creation, and a "Publish" button. Budget about 1 extra week for this vs. the self-signup version.
- Image handling: resize on upload (e.g. max 1600px, WebP) to keep pages light on Rewa mobile networks.
- Google Maps URL: validate that it is a `google.com/maps` or `maps.app.goo.gl` link; show as a "Get directions" button. No Maps API key needed for MVP.
- Public clinic page shows the cover image, gallery carousel, doctor cards, timings, and the directions button.
