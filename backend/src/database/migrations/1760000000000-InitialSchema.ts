import { MigrationInterface, QueryRunner } from 'typeorm';

/** Full schema from docs/MVP-SPEC.md section 7.2 (enums, partial indexes, checks, public view). */
export class InitialSchema1760000000000 implements MigrationInterface {
  name = 'InitialSchema1760000000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);

    await q.query(`CREATE TYPE user_role AS ENUM ('super_admin','clinic_owner','clinic_staff','patient')`);
    await q.query(`CREATE TYPE provider_type AS ENUM ('clinic','diagnostic_centre')`);
    await q.query(`CREATE TYPE clinic_status AS ENUM ('pending','approved','rejected','suspended')`);
    await q.query(`CREATE TYPE booking_mode AS ENUM ('token','slot')`);
    await q.query(`CREATE TYPE appointment_status AS ENUM
      ('booked','checked_in','in_consultation','completed','cancelled_by_patient','cancelled_by_clinic','no_show','skipped')`);
    await q.query(`CREATE TYPE appointment_source AS ENUM ('online','walkin')`);
    await q.query(`CREATE TYPE subscription_kind AS ENUM ('trial','paid','gifted')`);
    await q.query(`CREATE TYPE subscription_status AS ENUM ('active','expired','cancelled')`);
    await q.query(`CREATE TYPE payment_status AS ENUM ('created','captured','failed','refunded')`);

    await q.query(`CREATE TABLE users (
      id BIGSERIAL PRIMARY KEY,
      role user_role NOT NULL,
      name TEXT,
      mobile VARCHAR(15) NOT NULL UNIQUE,
      email TEXT UNIQUE,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      last_login_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);

    await q.query(`CREATE TABLE otp_requests (
      id BIGSERIAL PRIMARY KEY,
      mobile VARCHAR(15) NOT NULL,
      code_hash TEXT NOT NULL,
      purpose TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      attempts SMALLINT NOT NULL DEFAULT 0,
      consumed_at TIMESTAMPTZ,
      ip INET,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
    await q.query(`CREATE INDEX idx_otp_requests_mobile_created ON otp_requests (mobile, created_at DESC)`);

    await q.query(`CREATE TABLE clinics (
      id BIGSERIAL PRIMARY KEY,
      type provider_type NOT NULL DEFAULT 'clinic',
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      description TEXT,
      phone VARCHAR(15) NOT NULL,
      whatsapp VARCHAR(15),
      email TEXT,
      address_line TEXT NOT NULL,
      area TEXT NOT NULL,
      city TEXT NOT NULL DEFAULT 'Rewa',
      state TEXT NOT NULL DEFAULT 'Madhya Pradesh',
      pincode VARCHAR(6),
      map_url TEXT,
      latitude NUMERIC(9,6),
      longitude NUMERIC(9,6),
      registration_no TEXT,
      logo_url TEXT,
      cover_url TEXT,
      trial_days SMALLINT,
      created_by BIGINT REFERENCES users(id),
      status clinic_status NOT NULL DEFAULT 'pending',
      rejection_reason TEXT,
      approved_at TIMESTAMPTZ,
      approved_by BIGINT REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
    await q.query(`CREATE INDEX idx_clinics_city_area_approved ON clinics (city, area) WHERE status = 'approved'`);
    await q.query(`CREATE INDEX idx_clinics_name_trgm ON clinics USING gin (name gin_trgm_ops)`);

    await q.query(`CREATE TABLE clinic_members (
      clinic_id BIGINT NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
      user_id BIGINT NOT NULL REFERENCES users(id),
      role user_role NOT NULL CHECK (role IN ('clinic_owner','clinic_staff')),
      PRIMARY KEY (clinic_id, user_id)
    )`);

    await q.query(`CREATE TABLE clinic_documents (
      id BIGSERIAL PRIMARY KEY,
      clinic_id BIGINT NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
      doc_type TEXT NOT NULL,
      file_url TEXT NOT NULL,
      verified BOOLEAN NOT NULL DEFAULT FALSE,
      uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);

    await q.query(`CREATE TABLE clinic_images (
      id BIGSERIAL PRIMARY KEY,
      clinic_id BIGINT NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
      image_url TEXT NOT NULL,
      caption TEXT,
      sort_order SMALLINT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
    await q.query(`CREATE INDEX idx_clinic_images_clinic_sort ON clinic_images (clinic_id, sort_order)`);

    await q.query(`CREATE TABLE specializations (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      name_hi TEXT,
      slug TEXT NOT NULL UNIQUE
    )`);

    await q.query(`CREATE TABLE doctors (
      id BIGSERIAL PRIMARY KEY,
      clinic_id BIGINT NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
      specialization_id INT NOT NULL REFERENCES specializations(id),
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      qualification TEXT,
      experience_years SMALLINT,
      medical_reg_no TEXT,
      consultation_fee NUMERIC(8,2),
      languages TEXT[] DEFAULT '{}',
      bio TEXT,
      photo_url TEXT,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
    await q.query(`CREATE INDEX idx_doctors_clinic ON doctors (clinic_id)`);
    await q.query(`CREATE INDEX idx_doctors_specialization_active ON doctors (specialization_id) WHERE is_active`);

    await q.query(`CREATE TABLE doctor_schedules (
      id BIGSERIAL PRIMARY KEY,
      doctor_id BIGINT NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
      weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6),
      session_name TEXT NOT NULL DEFAULT 'Session',
      start_time TIME NOT NULL,
      end_time TIME NOT NULL CHECK (end_time > start_time),
      mode booking_mode NOT NULL DEFAULT 'token',
      slot_minutes SMALLINT,
      max_tokens SMALLINT NOT NULL,
      walkin_reserved SMALLINT NOT NULL DEFAULT 0,
      is_active BOOLEAN NOT NULL DEFAULT TRUE
    )`);
    await q.query(`CREATE INDEX idx_doctor_schedules_doctor_weekday ON doctor_schedules (doctor_id, weekday) WHERE is_active`);

    await q.query(`CREATE TABLE doctor_leaves (
      id BIGSERIAL PRIMARY KEY,
      doctor_id BIGINT NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
      leave_date DATE NOT NULL,
      schedule_id BIGINT REFERENCES doctor_schedules(id),
      reason TEXT,
      UNIQUE (doctor_id, leave_date, schedule_id)
    )`);
    // NULL schedule_id means "whole day": the plain UNIQUE above treats NULLs as distinct, so guard that case too.
    await q.query(`CREATE UNIQUE INDEX uq_doctor_leave_whole_day ON doctor_leaves (doctor_id, leave_date) WHERE schedule_id IS NULL`);

    await q.query(`CREATE TABLE patients (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id),
      name TEXT NOT NULL,
      age SMALLINT,
      gender CHAR(1) CHECK (gender IN ('M','F','O')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
    await q.query(`CREATE INDEX idx_patients_user ON patients (user_id)`);

    await q.query(`CREATE TABLE token_counters (
      schedule_id BIGINT NOT NULL REFERENCES doctor_schedules(id),
      visit_date DATE NOT NULL,
      last_token INT NOT NULL DEFAULT 0,
      now_serving INT NOT NULL DEFAULT 0,
      PRIMARY KEY (schedule_id, visit_date)
    )`);

    await q.query(`CREATE TABLE appointments (
      id BIGSERIAL PRIMARY KEY,
      public_id UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
      clinic_id BIGINT NOT NULL REFERENCES clinics(id),
      doctor_id BIGINT NOT NULL REFERENCES doctors(id),
      schedule_id BIGINT NOT NULL REFERENCES doctor_schedules(id),
      patient_id BIGINT NOT NULL REFERENCES patients(id),
      visit_date DATE NOT NULL,
      token_no INT NOT NULL,
      slot_time TIME,
      status appointment_status NOT NULL DEFAULT 'booked',
      source appointment_source NOT NULL DEFAULT 'online',
      fee_amount NUMERIC(8,2),
      notes TEXT,
      cancelled_reason TEXT,
      checked_in_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (schedule_id, visit_date, token_no)
    )`);
    await q.query(`CREATE UNIQUE INDEX uq_active_patient_session ON appointments (patient_id, schedule_id, visit_date)
      WHERE status IN ('booked','checked_in','in_consultation')`);
    await q.query(`CREATE INDEX idx_appointments_clinic_date_status ON appointments (clinic_id, visit_date, status)`);
    await q.query(`CREATE INDEX idx_appointments_doctor_date ON appointments (doctor_id, visit_date)`);

    await q.query(`CREATE TABLE plans (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      duration_months SMALLINT NOT NULL,
      price NUMERIC(10,2) NOT NULL,
      gst_percent NUMERIC(4,2) NOT NULL DEFAULT 18,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      sort_order SMALLINT NOT NULL DEFAULT 0
    )`);

    await q.query(`CREATE TABLE subscriptions (
      id BIGSERIAL PRIMARY KEY,
      clinic_id BIGINT NOT NULL REFERENCES clinics(id),
      plan_id INT REFERENCES plans(id),
      kind subscription_kind NOT NULL,
      starts_at TIMESTAMPTZ NOT NULL,
      ends_at TIMESTAMPTZ NOT NULL CHECK (ends_at > starts_at),
      status subscription_status NOT NULL DEFAULT 'active',
      created_by BIGINT REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
    await q.query(`CREATE INDEX idx_subscriptions_clinic_ends ON subscriptions (clinic_id, ends_at DESC)`);

    await q.query(`CREATE TABLE payments (
      id BIGSERIAL PRIMARY KEY,
      clinic_id BIGINT NOT NULL REFERENCES clinics(id),
      subscription_id BIGINT REFERENCES subscriptions(id),
      plan_id INT NOT NULL REFERENCES plans(id),
      amount NUMERIC(10,2) NOT NULL,
      gst_amount NUMERIC(10,2) NOT NULL,
      status payment_status NOT NULL DEFAULT 'created',
      razorpay_order_id TEXT UNIQUE,
      razorpay_payment_id TEXT UNIQUE,
      invoice_no TEXT UNIQUE,
      invoice_url TEXT,
      paid_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);

    await q.query(`CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);

    await q.query(`CREATE TABLE notification_logs (
      id BIGSERIAL PRIMARY KEY,
      channel TEXT NOT NULL,
      to_address TEXT NOT NULL,
      template TEXT NOT NULL,
      payload JSONB,
      status TEXT NOT NULL DEFAULT 'queued',
      error TEXT,
      related_appointment_id BIGINT REFERENCES appointments(id),
      related_clinic_id BIGINT REFERENCES clinics(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);

    await q.query(`CREATE TABLE audit_logs (
      id BIGSERIAL PRIMARY KEY,
      actor_id BIGINT REFERENCES users(id),
      action TEXT NOT NULL,
      entity TEXT NOT NULL,
      entity_id BIGINT,
      details JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);

    // Every public query must go through this view (approved + active subscription within grace).
    await q.query(`CREATE VIEW v_public_clinics AS
      SELECT c.* FROM clinics c
      WHERE c.status = 'approved'
        AND EXISTS (
          SELECT 1 FROM subscriptions s
          WHERE s.clinic_id = c.id AND s.status = 'active'
            AND s.ends_at + make_interval(days => COALESCE(
              (SELECT value::int FROM app_settings WHERE key = 'grace_days'), 3)) > now()
        )`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP VIEW IF EXISTS v_public_clinics`);
    for (const t of [
      'audit_logs', 'notification_logs', 'app_settings', 'payments', 'subscriptions', 'plans',
      'appointments', 'token_counters', 'patients', 'doctor_leaves', 'doctor_schedules', 'doctors',
      'specializations', 'clinic_images', 'clinic_documents', 'clinic_members', 'clinics',
      'otp_requests', 'users',
    ]) {
      await q.query(`DROP TABLE IF EXISTS ${t} CASCADE`);
    }
    for (const e of [
      'payment_status', 'subscription_status', 'subscription_kind', 'appointment_source',
      'appointment_status', 'booking_mode', 'clinic_status', 'provider_type', 'user_role',
    ]) {
      await q.query(`DROP TYPE IF EXISTS ${e}`);
    }
  }
}
