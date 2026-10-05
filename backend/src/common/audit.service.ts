import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { AuditLog } from '../database/entities/index.js';

@Injectable()
export class AuditService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  /** Pass `manager` to write inside the caller's transaction. */
  async log(
    actorId: string | null,
    action: string,
    entity: string,
    entityId: string | null,
    details?: Record<string, unknown>,
    manager?: EntityManager,
  ): Promise<void> {
    const repo = (manager ?? this.ds.manager).getRepository(AuditLog);
    await repo.insert({ actorId, action, entity, entityId, details: details as never });
  }
}
