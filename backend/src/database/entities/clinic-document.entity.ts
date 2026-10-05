import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import type { Relation } from 'typeorm';
import { Clinic } from './clinic.entity.js';

@Entity('clinic_documents')
export class ClinicDocument {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'clinic_id', type: 'bigint' })
  clinicId: string;

  @ManyToOne(() => Clinic, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'clinic_id' })
  clinic: Relation<Clinic>;

  /** clinic_registration | doctor_licence | id_proof */
  @Column({ name: 'doc_type', type: 'text' })
  docType: string;

  @Column({ name: 'file_url', type: 'text' })
  fileUrl: string;

  @Column({ default: false })
  verified: boolean;

  @CreateDateColumn({ name: 'uploaded_at', type: 'timestamptz' })
  uploadedAt: Date;
}
