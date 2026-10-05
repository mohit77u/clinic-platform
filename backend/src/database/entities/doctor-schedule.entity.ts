import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import type { Relation } from 'typeorm';
import { BookingMode } from '../../common/enums.js';
import { Doctor } from './doctor.entity.js';

/** One row = one session pattern (e.g. Mon morning) */
@Entity('doctor_schedules')
export class DoctorSchedule {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'doctor_id', type: 'bigint' })
  doctorId: string;

  @ManyToOne(() => Doctor, (d) => d.schedules, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'doctor_id' })
  doctor: Relation<Doctor>;

  /** 0 = Sunday */
  @Column({ type: 'smallint' })
  weekday: number;

  @Column({ name: 'session_name', type: 'text', default: 'Session' })
  sessionName: string;

  @Column({ name: 'start_time', type: 'time' })
  startTime: string;

  @Column({ name: 'end_time', type: 'time' })
  endTime: string;

  @Column({ type: 'enum', enum: BookingMode, enumName: 'booking_mode', default: BookingMode.TOKEN })
  mode: BookingMode;

  /** slot mode, or average minutes/patient in token mode */
  @Column({ name: 'slot_minutes', type: 'smallint', nullable: true })
  slotMinutes: number | null;

  /** capacity per session */
  @Column({ name: 'max_tokens', type: 'smallint' })
  maxTokens: number;

  /** tokens kept for walk-ins */
  @Column({ name: 'walkin_reserved', type: 'smallint', default: 0 })
  walkinReserved: number;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;
}
