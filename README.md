# Clinic Platform

Doctors' clinics in Rewa, MP: patients find a clinic, book a **token** online and follow the **queue live**; clinics run their day from a phone; the platform runs on a **trial → paid subscription** model managed by a super admin.

| Folder | What |
|---|---|
| `backend/` | NestJS 12 + TypeORM + PostgreSQL + Redis API (WhatsApp OTP auth, booking/tokens, queue, subscriptions, Razorpay, invoices, privacy) |
| `frontend/` | Next.js 16 app: public site (Hindi/English, SEO), booking, live queue, clinic panel, admin panel |
| `docs/` | `MVP-SPEC.md` (what), `IMPLEMENTATION-PLAN.md` (how/order), `runbook.md` (run, deploy, operate) |
| `deploy/` | nginx, systemd units, deploy script |

Quick start and the go-live checklist: [`docs/runbook.md`](docs/runbook.md).

## What is built
- **Auth**: mobile OTP delivered over WhatsApp (hashed, rate-limited, 5 attempts), JWT in httpOnly cookies + refresh, role guards, per-clinic scope guard, CSRF origin check, per-IP rate limit.
- **Admin**: clinics (Google-Maps link validation), image pipeline (WebP + thumbs), doctors, weekly schedules with overlap protection, leaves (auto-cancel + notify), owner/receptionist logins, publish with trial (global default or per-clinic override), suspend/reject/gift days/manual payment, KYC documents via 5-minute signed links, plans, areas, settings, audit log, privacy requests.
- **Public**: search (area, speciality, text with typo tolerance, available today) over `v_public_clinics` only; clinic/doctor pages with JSON-LD, sitemap, robots.
- **Booking**: availability, atomic token allocation (row lock + unique constraints), walk-in reserve, one active booking per patient per session, cancel cut-off, estimated time, public live queue page, one WhatsApp reminder per booking, sent a patient-chosen time (5 min – 12 h, default 30 min) before their estimated turn — computed from the live queue, so it adapts when the doctor runs early or late.
- **Per-clinic live queue switch** (Admin → Clinic → Details): off = patients see only their token and the approximate time given at booking, and the WhatsApp reminder is sent that long before that fixed time (no dependence on the real queue).
- **Clinic panel**: mobile-first queue (check-in, call next, skip, recall, done, no-show, cancel with reason, walk-ins), doctor leave, subscription banners, owner-only billing with Razorpay checkout (test gateway in dev), GST invoices (PDF, gapless numbering per financial year).
- **Jobs**: no-show closer, turn reminders (every 5 min and on every queue movement), subscription sweeper (after grace), renewal reminders (7/3/1 days), OTP cleanup.
- **Ops**: backup + restore-drill scripts, Sentry hook, health endpoint.

## Not built (by design / next)
Pathology & diagnostic centres, prescriptions/EMR, patient payments, clinic self-signup, reviews, native apps (see the spec's Phase 2 backlog). Admin screens are English only; patient and clinic-panel screens are Hindi/English.
