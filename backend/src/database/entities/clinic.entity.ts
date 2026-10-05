import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';
import { ClinicStatus, ProviderType } from '../../common/enums.js';
import { User } from './user.entity.js';
import { ClinicImage } from './clinic-image.entity.js';
import { Doctor } from './doctor.entity.js';

@Entity('clinics')
export class Clinic {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ type: 'enum', enum: ProviderType, enumName: 'provider_type', default: ProviderType.CLINIC })
  type: ProviderType;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'text', unique: true })
  slug: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', length: 15 })
  phone: string;

  @Column({ type: 'varchar', length: 15, nullable: true })
  whatsapp: string | null;

  @Column({ type: 'text', nullable: true })
  email: string | null;

  @Column({ name: 'address_line', type: 'text' })
  addressLine: string;

  /** locality (filter) */
  @Column({ type: 'text' })
  area: string;

  @Column({ type: 'text', default: 'Rewa' })
  city: string;

  @Column({ type: 'text', default: 'Madhya Pradesh' })
  state: string;

  @Column({ type: 'varchar', length: 6, nullable: true })
  pincode: string | null;

  /** Google Maps share link, shown as "Get directions" */
  @Column({ name: 'map_url', type: 'text', nullable: true })
  mapUrl: string | null;

  @Column({ type: 'numeric', precision: 9, scale: 6, nullable: true })
  latitude: string | null;

  @Column({ type: 'numeric', precision: 9, scale: 6, nullable: true })
  longitude: string | null;

  @Column({ name: 'registration_no', type: 'text', nullable: true })
  registrationNo: string | null;

  @Column({ name: 'logo_url', type: 'text', nullable: true })
  logoUrl: string | null;

  @Column({ name: 'cover_url', type: 'text', nullable: true })
  coverUrl: string | null;

  /** per-clinic trial override; null = app_settings.default_trial_days */
  @Column({ name: 'trial_days', type: 'smallint', nullable: true })
  trialDays: number | null;

  @Column({ name: 'created_by', type: 'bigint', nullable: true })
  createdById: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'created_by' })
  createdBy: Relation<User> | null;

  /** false: patients see only token + approximate time; reminders use that fixed time */
  @Column({ name: 'live_queue_enabled', default: true })
  liveQueueEnabled: boolean;

  @Column({ type: 'enum', enum: ClinicStatus, enumName: 'clinic_status', default: ClinicStatus.PENDING })
  status: ClinicStatus;

  @Column({ name: 'rejection_reason', type: 'text', nullable: true })
  rejectionReason: string | null;

  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true })
  approvedAt: Date | null;

  @Column({ name: 'approved_by', type: 'bigint', nullable: true })
  approvedById: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'approved_by' })
  approvedBy: Relation<User> | null;

  @OneToMany(() => ClinicImage, (i) => i.clinic)
  images: Relation<ClinicImage[]>;

  @OneToMany(() => Doctor, (d) => d.clinic)
  doctors: Relation<Doctor[]>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
