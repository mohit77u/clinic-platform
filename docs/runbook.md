# Runbook

## Local development
```bash
# prerequisites: Node 24, PostgreSQL 14+, Redis
cd backend
cp .env.example .env            # fill DB_* ; secrets must be 32+ chars
createdb clinic_platform
npm install
npm run migration:run           # schema
npm run seed                    # plans, settings, specialisations, areas (SEED_ADMIN_MOBILE=... creates a super admin)
npm run seed:demo               # optional: 3 demo clinics + logins 9000000001 (admin) / 02 (owner) / 03 (reception)
npm run start:dev               # http://localhost:3001  (OTPs are printed in this terminal)

cd ../frontend
cp .env.example .env.local
npm install && npm run dev      # http://localhost:3000
```

## Tests
```bash
cd backend
npm test            # unit
npm run test:e2e    # needs Postgres + Redis; uses database clinic_platform_test (created by hand once: createdb clinic_platform_test)
cd ../frontend && npm run lint && npm run build
```
The e2e suite covers: OTP auth, role/route guards (every route is enumerated), booking + 50-way concurrency, queue operations, leave handling, payments (webhook replay, gapless invoices), privacy, documents.

## Production checklist (one VPS)
1. Managed or local PostgreSQL 14+, Redis, Node 24, nginx (`deploy/nginx.conf`), systemd units (`deploy/*.service`).
2. `backend/.env`: `NODE_ENV=production`, strong `JWT_SECRET` / `JWT_REFRESH_SECRET`, `COOKIE_SECURE=true`, `TRUST_PROXY=true`, `CORS_ORIGIN=https://example.com`, `PUBLIC_BASE_URL=https://api.example.com`, `WEB_BASE_URL=https://example.com`, `NOTIFIER=live` + `WHATSAPP_API_KEY` (**the API refuses to start in production without them**), Razorpay keys (**the API refuses to start in production without them**), `SENTRY_DSN`, company/GSTIN details for invoices.
3. `frontend/.env.local`: `NEXT_PUBLIC_API_URL=https://api.example.com`, `NEXT_PUBLIC_SITE_URL=https://example.com`. Use sub-domains of one registrable domain so the SameSite=Lax session cookie works.
4. Razorpay dashboard → webhook `https://api.example.com/webhooks/razorpay`, events `payment.captured` (and `order.paid`), same secret as `RAZORPAY_WEBHOOK_SECRET`.
5. `npm run migration:run && npm run seed`, then create the first super admin: `SEED_ADMIN_MOBILE=91XXXXXXXXXX npm run seed` (E.164 without `+`).
6. Cron: `15 2 * * * cd /srv/clinic-platform/backend && ./scripts/backup.sh` (also copy `backups/`, `uploads/`, `private/` off the server). Monthly: `./scripts/restore-drill.sh`.
7. Uptime monitor on `https://api.example.com/health` (200 + `{"status":"ok"}`); Sentry for errors; `journalctl -u clinic-api` for logs (set `SystemMaxUse` for retention).
8. Deploy with `deploy/deploy.sh` (backs up first, migrates, restarts, health-checks).

## Things that must be done before real patients (not code)
- **WhatsApp Business** (the only messaging channel — there is no SMS): Meta Business verification, a WhatsApp Business account + a BSP (Interakt-style) → `WHATSAPP_API_KEY`, `NOTIFIER=live`. Create these templates in WhatsApp Manager with **exactly the template key as the name** (lower-case with underscores) and the wording from `backend/src/common/notification-templates.ts`; variables are positional in the order they appear in the text:
  - `otp` — must be an **Authentication** template (copy-code button). Our adapter sends the code both as body variable `{{1}}` and as the button value.
  - Utility templates: `booking_confirmed`, `booking_cancelled`, `booking_cancelled_by_clinic`, `turn_near`, `appointment_reminder`, `walkin_token`, `subscription_expiring`, `subscription_expired`, `payment_received`.
  - Cost (INR, per delivered message, GST extra; rates quoted by third-party sites, check your BSP dashboard): authentication and utility ≈ ₹0.115, i.e. about ₹0.35–0.45 per booking (OTP + confirmation + one turn reminder). Plus the BSP's own fee, if any.
  - The adapter (`backend/src/common/provider-notifiers.ts`) follows the BSP's documented API but has **not been exercised against a live account**: send test messages before launch. If WhatsApp is down the OTP request returns 503 (there is no fallback channel), so watch Sentry/`notification_logs` for `failed` rows.
- **Razorpay** KYC + live keys; confirm GSTIN/state for invoices (`COMPANY_*`).
- Real **Rewa locality list** (Admin → Areas; the seeded ones are placeholders), privacy policy / terms legal review, clinic agreement.
- Pilot: 10–15 clinics entered by admin, QR posters pointing at each clinic page, 15-minute receptionist walkthrough.

## Operations
- **Booking looks wrong?** `appointments` + `token_counters` are the source of truth; tokens are issued only in `TokenAllocator` (row-locked). Never edit `last_token` by hand.
- **Clinic disappeared from search?** Its subscription ended more than `grace_days` ago, or it is suspended. Admin → Clinic → Subscription: gift days / record manual payment.
- **Payment taken but plan not extended?** Check Razorpay webhook delivery; replaying the webhook is safe (idempotent). Admin → Payments shows `created` vs `captured`.
- **Privacy request:** Admin → Privacy requests → Anonymize (cancel the patient's upcoming bookings first).
- **Restore:** `pg_restore -d clinic_platform --clean --no-owner backups/<file>.dump`; restore `uploads/` and `private/` from the same day.
