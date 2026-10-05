import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('notification_logs')
export class NotificationLog {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  /** whatsapp */
  @Column({ type: 'text' })
  channel: string;

  @Column({ name: 'to_address', type: 'text' })
  toAddress: string;

  @Column({ type: 'text' })
  template: string;

  @Column({ type: 'jsonb', nullable: true })
  payload: Record<string, unknown> | null;

  /** queued | sent | failed */
  @Column({ type: 'text', default: 'queued' })
  status: string;

  @Column({ type: 'text', nullable: true })
  error: string | null;

  @Column({ name: 'related_appointment_id', type: 'bigint', nullable: true })
  relatedAppointmentId: string | null;

  @Column({ name: 'related_clinic_id', type: 'bigint', nullable: true })
  relatedClinicId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
