import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import type { Relation } from 'typeorm';
import { Doctor } from './doctor.entity.js';
import { DoctorSchedule } from './doctor-schedule.entity.js';

@Entity('doctor_leaves')
@Unique(['doctorId', 'leaveDate', 'scheduleId'])
export class DoctorLeave {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'doctor_id', type: 'bigint' })
  doctorId: string;

  @ManyToOne(() => Doctor, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'doctor_id' })
  doctor: Relation<Doctor>;

  @Column({ name: 'leave_date', type: 'date' })
  leaveDate: string;

  /** null = whole day */
  @Column({ name: 'schedule_id', type: 'bigint', nullable: true })
  scheduleId: string | null;

  @ManyToOne(() => DoctorSchedule, { nullable: true })
  @JoinColumn({ name: 'schedule_id' })
  schedule: Relation<DoctorSchedule> | null;

  @Column({ type: 'text', nullable: true })
  reason: string | null;
}
