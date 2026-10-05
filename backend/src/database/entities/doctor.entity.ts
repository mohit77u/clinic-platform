import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';
import { Clinic } from './clinic.entity.js';
import { Specialization } from './specialization.entity.js';
import { DoctorSchedule } from './doctor-schedule.entity.js';

@Entity('doctors')
export class Doctor {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'clinic_id', type: 'bigint' })
  clinicId: string;

  @ManyToOne(() => Clinic, (c) => c.doctors, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'clinic_id' })
  clinic: Relation<Clinic>;

  @Column({ name: 'specialization_id', type: 'int' })
  specializationId: number;

  @ManyToOne(() => Specialization)
  @JoinColumn({ name: 'specialization_id' })
  specialization: Relation<Specialization>;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'text', unique: true })
  slug: string;

  @Column({ type: 'text', nullable: true })
  qualification: string | null;

  @Column({ name: 'experience_years', type: 'smallint', nullable: true })
  experienceYears: number | null;

  /** MP Medical Council no. */
  @Column({ name: 'medical_reg_no', type: 'text', nullable: true })
  medicalRegNo: string | null;

  @Column({ name: 'consultation_fee', type: 'numeric', precision: 8, scale: 2, nullable: true })
  consultationFee: string | null;

  @Column({ type: 'text', array: true, default: () => "'{}'" })
  languages: string[];

  @Column({ type: 'text', nullable: true })
  bio: string | null;

  @Column({ name: 'photo_url', type: 'text', nullable: true })
  photoUrl: string | null;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @OneToMany(() => DoctorSchedule, (s) => s.doctor)
  schedules: Relation<DoctorSchedule[]>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
