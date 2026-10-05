import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import type { Relation } from 'typeorm';
import { UserRole } from '../../common/enums.js';
import { Clinic } from './clinic.entity.js';
import { User } from './user.entity.js';

/** who may manage which clinic (role: clinic_owner | clinic_staff) */
@Entity('clinic_members')
export class ClinicMember {
  @PrimaryColumn({ name: 'clinic_id', type: 'bigint' })
  clinicId: string;

  @PrimaryColumn({ name: 'user_id', type: 'bigint' })
  userId: string;

  @Column({ type: 'enum', enum: UserRole, enumName: 'user_role' })
  role: UserRole;

  @ManyToOne(() => Clinic, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'clinic_id' })
  clinic: Relation<Clinic>;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: Relation<User>;
}
