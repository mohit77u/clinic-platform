import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** Editable list of Rewa localities used by the clinic `area` filter. */
@Entity('areas')
export class Area {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'text', unique: true })
  name: string;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'sort_order', type: 'smallint', default: 0 })
  sortOrder: number;
}
