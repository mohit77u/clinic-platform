import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AuditService } from '../common/audit.service.js';
import { UserRole } from '../common/enums.js';

@Injectable()
export class PrivacyService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly audit: AuditService,
  ) {}

  /** Everything we hold about the caller, as one JSON document (DPDP "right to access"). */
  async export(userId: string) {
    const [user] = await this.ds.query(`SELECT id, role, name, mobile, email, created_at AS "createdAt", last_login_at AS "lastLoginAt" FROM users WHERE id = $1`, [userId]);
    const patients = await this.ds.query(`SELECT id, name, age, gender, created_at AS "createdAt" FROM patients WHERE user_id = $1 ORDER BY id`, [userId]);
    const appointments = await this.ds.query(
      `SELECT a.public_id AS "bookingId", a.visit_date::text AS "visitDate", a.token_no AS "tokenNo", a.status, a.source, a.fee_amount AS "fee",
              p.name AS "patientName", c.name AS "clinic", d.name AS "doctor", a.created_at AS "createdAt"
         FROM appointments a JOIN patients p ON p.id = a.patient_id JOIN clinics c ON c.id = a.clinic_id JOIN doctors d ON d.id = a.doctor_id
        WHERE p.user_id = $1 ORDER BY a.visit_date DESC`,
      [userId],
    );
    const messages = await this.ds.query(
      `SELECT channel, template, status, created_at AS "createdAt" FROM notification_logs WHERE to_address = $1 ORDER BY id DESC LIMIT 500`,
      [user.mobile],
    );
    return { exportedAt: new Date().toISOString(), user, patients, appointments, messages };
  }

  /** Records the request; an admin executes it (so live bookings and legal holds can be checked first). */
  async requestDeletion(userId: string, reason?: string) {
    const existing = await this.ds.query(
      `SELECT id FROM audit_logs WHERE action = 'privacy.delete_requested' AND entity = 'user' AND entity_id = $1
         AND NOT EXISTS (SELECT 1 FROM audit_logs d WHERE d.action = 'privacy.user_anonymized' AND d.entity_id = $1)`,
      [userId],
    );
    if (existing.length) return { status: 'already_requested' };
    await this.audit.log(userId, 'privacy.delete_requested', 'user', userId, { reason });
    return { status: 'requested' };
  }

  listRequests() {
    return this.ds.query(
      `SELECT a.id, a.entity_id AS "userId", u.name, u.mobile, a.details->>'reason' AS reason, a.created_at AS "requestedAt"
         FROM audit_logs a JOIN users u ON u.id = a.entity_id
        WHERE a.action = 'privacy.delete_requested'
          AND NOT EXISTS (SELECT 1 FROM audit_logs d WHERE d.action = 'privacy.user_anonymized' AND d.entity_id = a.entity_id)
        ORDER BY a.id`,
    );
  }

  /** Irreversibly strips personal data. Appointment rows stay (clinic records / revenue) but point at an anonymous profile. */
  async anonymize(userId: string, adminId: string) {
    return this.ds.transaction(async (m) => {
      const [u] = await m.query(`SELECT id, role, mobile FROM users WHERE id = $1 FOR UPDATE`, [userId]);
      if (!u) throw new NotFoundException('User not found');
      if (u.role !== UserRole.PATIENT) throw new ConflictException('Only patient accounts can be anonymized here');
      const live = await m.query(
        `SELECT 1 FROM appointments a JOIN patients p ON p.id = a.patient_id
          WHERE p.user_id = $1 AND a.status IN ('booked','checked_in','in_consultation') AND a.visit_date >= CURRENT_DATE LIMIT 1`,
        [userId],
      );
      if (live.length) throw new ConflictException('Cancel the patient\'s upcoming bookings first');

      await m.query(`UPDATE patients SET name = 'Deleted patient', age = NULL, gender = NULL WHERE user_id = $1`, [userId]);
      await m.query(`UPDATE appointments SET notes = NULL WHERE patient_id IN (SELECT id FROM patients WHERE user_id = $1)`, [userId]);
      await m.query(`UPDATE notification_logs SET to_address = 'deleted', payload = NULL WHERE to_address = $1`, [u.mobile]);
      await m.query(`DELETE FROM otp_requests WHERE mobile = $1`, [u.mobile]);
      await m.query(`UPDATE users SET name = 'Deleted user', mobile = $2, email = NULL, is_active = false WHERE id = $1`, [userId, `del${userId}`]);
      await this.audit.log(adminId, 'privacy.user_anonymized', 'user', userId, undefined, m);
      return { ok: true };
    });
  }
}
