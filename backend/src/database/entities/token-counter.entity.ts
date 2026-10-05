import { Column, Entity, PrimaryColumn } from 'typeorm';

/** Row-locked counter for atomic token allocation */
@Entity('token_counters')
export class TokenCounter {
  @PrimaryColumn({ name: 'schedule_id', type: 'bigint' })
  scheduleId: string;

  @PrimaryColumn({ name: 'visit_date', type: 'date' })
  visitDate: string;

  @Column({ name: 'last_token', type: 'int', default: 0 })
  lastToken: number;

  /** drives the live queue display */
  @Column({ name: 'now_serving', type: 'int', default: 0 })
  nowServing: number;
}
