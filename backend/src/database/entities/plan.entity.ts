import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('plans')
export class Plan {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'text' })
  name: string;

  @Column({ name: 'duration_months', type: 'smallint' })
  durationMonths: number;

  /** base price excluding GST */
  @Column({ type: 'numeric', precision: 10, scale: 2 })
  price: string;

  @Column({ name: 'gst_percent', type: 'numeric', precision: 4, scale: 2, default: 18 })
  gstPercent: string;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'sort_order', type: 'smallint', default: 0 })
  sortOrder: number;
}
