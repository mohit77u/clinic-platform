import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppSetting } from '../database/entities/index.js';

/** Editable platform settings. All values are non-negative integers. */
export const SETTING_KEYS = ['default_trial_days', 'grace_days', 'advance_booking_days', 'cancel_cutoff_minutes', 'default_reminder_minutes'] as const;
export type SettingKey = (typeof SETTING_KEYS)[number];

const DEFAULTS: Record<SettingKey, number> = {
  default_trial_days: 30,
  grace_days: 3,
  advance_booking_days: 7,
  cancel_cutoff_minutes: 60,
  default_reminder_minutes: 30,
};

@Injectable()
export class SettingsService {
  constructor(@InjectRepository(AppSetting) private readonly repo: Repository<AppSetting>) {}

  async getInt(key: SettingKey): Promise<number> {
    const row = await this.repo.findOne({ where: { key } });
    const n = row ? Number.parseInt(row.value, 10) : NaN;
    return Number.isFinite(n) ? n : DEFAULTS[key];
  }

  async getAll(): Promise<Record<SettingKey, number>> {
    const out = { ...DEFAULTS };
    for (const row of await this.repo.find()) {
      if ((SETTING_KEYS as readonly string[]).includes(row.key)) {
        const n = Number.parseInt(row.value, 10);
        if (Number.isFinite(n)) out[row.key as SettingKey] = n;
      }
    }
    return out;
  }

  async set(key: string, value: number): Promise<void> {
    if (!(SETTING_KEYS as readonly string[]).includes(key)) throw new BadRequestException(`Unknown setting: ${key}`);
    if (!Number.isInteger(value) || value < 0 || value > 3650) throw new BadRequestException('Value must be a whole number between 0 and 3650');
    await this.repo.upsert({ key, value: String(value) }, ['key']);
  }
}
