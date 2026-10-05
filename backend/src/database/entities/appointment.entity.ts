import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import type { Relation } from 'typeorm';
import { AppointmentSource, AppointmentStatus } from '../../common/enums.js';
import { Clinic } from './clinic.entity.js';
import { Doctor } from './doctor.entity.js';
import { DoctorSchedule } from './doctor-schedule.entity.js';
import { Patient } from './patient.entity.js';

// Indexes (incl. partial unique uq_active_patient_session) live in the SQL migration.
@Entity('appointments')
@Unique(['scheduleId', 'visitDate', 'tokenNo'])
export class Appointment {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  /** used in the public queue link */
  @Column({ name: 'public_id', type: 'uuid', unique: true, default: () => 'gen_random_uuid()' })
  publicId: string;

  @Column({ name: 'clinic_id', type: 'bigint' })
  clinicId: string;

  @ManyToOne(() => Clinic)
  @JoinColumn({ name: 'clinic_id' })
  clinic: Relation<Clinic>;

  @Column({ name: 'doctor_id', type: 'bigint' })
  doctorId: string;

  @ManyToOne(() => Doctor)
  @JoinColumn({ name: 'doctor_id' })
  doctor: Relation<Doctor>;

  @Column({ name: 'schedule_id', type: 'bigint' })
  scheduleId: string;

  @ManyToOne(() => DoctorSchedule)
  @JoinColumn({ name: 'schedule_id' })
  schedule: Relation<DoctorSchedule>;

  @Column({ name: 'patient_id', type: 'bigint' })
  patientId: string;

  @ManyToOne(() => Patient)
  @JoinColumn({ name: 'patient_id' })
  patient: Relation<Patient>;

  @Column({ name: 'visit_date', type: 'date' })
  visitDate: string;

  @Column({ name: 'token_no', type: 'int' })
  tokenNo: number;

  /** slot mode, or estimated time in token mode */
  @Column({ name: 'slot_time', type: 'time', nullable: true })
  slotTime: string | null;

  @Column({
    type: 'enum',
    enum: AppointmentStatus,
    enumName: 'appointment_status',
    default: AppointmentStatus.BOOKED,
  })
  status: AppointmentStatus;

  @Column({
    type: 'enum',
    enum: AppointmentSource,
    enumName: 'appointment_source',
    default: AppointmentSource.ONLINE,
  })
  source: AppointmentSource;

  /** snapshot of the fee at booking time */
  @Column({ name: 'fee_amount', type: 'numeric', precision: 8, scale: 2, nullable: true })
  feeAmount: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ name: 'cancelled_reason', type: 'text', nullable: true })
  cancelledReason: string | null;

  @Column({ name: 'checked_in_at', type: 'timestamptz', nullable: true })
  checkedInAt: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  /** patient asked to be reminded this many minutes before their estimated turn (online bookings) */
  @Column({ name: 'remind_before_minutes', type: 'smallint', nullable: true })
  remindBeforeMinutes: number | null;

  @Column({ name: 'turn_near_sent_at', type: 'timestamptz', nullable: true })
  turnNearSentAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
