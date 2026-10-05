import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import type { Relation } from 'typeorm';
import { User } from './user.entity.js';

/** profiles under a mobile account */
@Entity('patients')
@Index(['userId'])
export class Patient {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  /** null for walk-in patients without a phone number */
  @Column({ name: 'user_id', type: 'bigint', nullable: true })
  userId: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'user_id' })
  user: Relation<User> | null;

  @Column({ name: 'created_by_clinic_id', type: 'bigint', nullable: true })
  createdByClinicId: string | null;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'smallint', nullable: true })
  age: number | null;

  /** M | F | O */
  @Column({ type: 'char', length: 1, nullable: true })
  gender: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
