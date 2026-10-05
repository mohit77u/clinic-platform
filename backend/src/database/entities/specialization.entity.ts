import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('specializations')
export class Specialization {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'text', unique: true })
  name: string;

  @Column({ name: 'name_hi', type: 'text', nullable: true })
  nameHi: string | null;

  @Column({ type: 'text', unique: true })
  slug: string;
}
