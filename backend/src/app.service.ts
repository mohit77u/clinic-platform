import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class AppService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async health() {
    await this.ds.query('SELECT 1');
    return { status: 'ok' };
  }
}
