import { BadRequestException, Body, ConflictException, Controller, Get, NotFoundException, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CurrentUser, Roles } from '../auth/auth.decorators.js';
import type { AuthUser } from '../auth/auth.types.js';
import { AuditService } from '../common/audit.service.js';
import { UserRole } from '../common/enums.js';
import { pageMeta } from '../common/pagination.js';
import { slugify, uniqueSlug } from '../common/slug.js';
import { Area, AuditLog, Plan, Specialization } from '../database/entities/index.js';
import { SettingsService } from '../settings/settings.service.js';
import {
  AuditQuery, CreateAreaDto, CreatePlanDto, CreateSpecializationDto, UpdateAreaDto, UpdatePlanDto, UpdateSettingsDto,
} from './dto.js';

@Roles(UserRole.SUPER_ADMIN)
@Controller('admin')
export class AdminController {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
  ) {}

  // ---- areas ----
  @Get('areas') areas() { return this.ds.getRepository(Area).find({ order: { sortOrder: 'ASC', name: 'ASC' } }); }

  @Post('areas')
  async createArea(@Body() dto: CreateAreaDto, @CurrentUser() u: AuthUser) {
    const repo = this.ds.getRepository(Area);
    if (await repo.exists({ where: { name: dto.name } })) throw new ConflictException('Area already exists');
    const area = await repo.save(repo.create({ name: dto.name, sortOrder: dto.sortOrder ?? 0 }));
    await this.audit.log(u.id, 'area.created', 'area', String(area.id));
    return area;
  }

  @Patch('areas/:id')
  async updateArea(@Param('id') id: string, @Body() dto: UpdateAreaDto, @CurrentUser() u: AuthUser) {
    const repo = this.ds.getRepository(Area);
    const area = await repo.findOne({ where: { id: Number(id) } });
    if (!area) throw new NotFoundException('Area not found');
    Object.assign(area, dto);
    const saved = await repo.save(area);
    await this.audit.log(u.id, 'area.updated', 'area', id);
    return saved;
  }

  // ---- plans ----
  @Get('plans') plans() { return this.ds.getRepository(Plan).find({ order: { sortOrder: 'ASC' } }); }

  @Post('plans')
  async createPlan(@Body() dto: CreatePlanDto, @CurrentUser() u: AuthUser) {
    const repo = this.ds.getRepository(Plan);
    const plan = await repo.save(repo.create({ ...dto, sortOrder: dto.sortOrder ?? 0 }));
    await this.audit.log(u.id, 'plan.created', 'plan', String(plan.id), { price: plan.price });
    return plan;
  }

  @Patch('plans/:id')
  async updatePlan(@Param('id') id: string, @Body() dto: UpdatePlanDto, @CurrentUser() u: AuthUser) {
    const repo = this.ds.getRepository(Plan);
    const plan = await repo.findOne({ where: { id: Number(id) } });
    if (!plan) throw new NotFoundException('Plan not found');
    Object.assign(plan, dto);
    const saved = await repo.save(plan);
    await this.audit.log(u.id, 'plan.updated', 'plan', id, { fields: Object.keys(dto) });
    return saved;
  }

  // ---- settings ----
  @Get('settings') getSettings() { return this.settings.getAll(); }

  @Put('settings')
  async putSettings(@Body() dto: UpdateSettingsDto, @CurrentUser() u: AuthUser) {
    const entries = Object.entries(dto).filter(([, v]) => v !== undefined);
    if (!entries.length) throw new BadRequestException('Nothing to update');
    for (const [k, v] of entries) await this.settings.set(k, v as number);
    await this.audit.log(u.id, 'settings.updated', 'app_settings', null, Object.fromEntries(entries));
    return this.settings.getAll();
  }

  // ---- specializations ----
  @Post('specializations')
  async createSpecialization(@Body() dto: CreateSpecializationDto, @CurrentUser() u: AuthUser) {
    const repo = this.ds.getRepository(Specialization);
    if (await repo.exists({ where: { name: dto.name } })) throw new ConflictException('Specialization already exists');
    const slug = await uniqueSlug(slugify(dto.name, 'spec'), (s) => repo.exists({ where: { slug: s } }));
    const spec = await repo.save(repo.create({ name: dto.name, nameHi: dto.nameHi ?? null, slug }));
    await this.audit.log(u.id, 'specialization.created', 'specialization', String(spec.id));
    return spec;
  }

  // ---- stats & audit ----
  @Get('stats')
  async stats() {
    const [clinics] = await this.ds.query(`SELECT
        COUNT(*) FILTER (WHERE status='pending')::int AS pending,
        COUNT(*) FILTER (WHERE status='approved')::int AS approved,
        COUNT(*) FILTER (WHERE status='suspended')::int AS suspended,
        COUNT(*) FILTER (WHERE status='rejected')::int AS rejected
      FROM clinics`);
    const [subs] = await this.ds.query(`SELECT
        COUNT(DISTINCT clinic_id) FILTER (WHERE kind='trial' AND status='active' AND ends_at > now())::int AS on_trial,
        COUNT(DISTINCT clinic_id) FILTER (WHERE kind='paid' AND status='active' AND ends_at > now())::int AS paying,
        COUNT(DISTINCT clinic_id) FILTER (WHERE status='active' AND ends_at > now() AND ends_at < now() + interval '7 days')::int AS expiring_7d
      FROM subscriptions`);
    const [bookings] = await this.ds.query(`SELECT
        COUNT(*) FILTER (WHERE visit_date = CURRENT_DATE)::int AS today,
        COUNT(*) FILTER (WHERE created_at > now() - interval '30 days')::int AS last_30_days
      FROM appointments WHERE status NOT IN ('cancelled_by_patient','cancelled_by_clinic')`);
    const [revenue] = await this.ds.query(`SELECT
        COALESCE(SUM(amount) FILTER (WHERE paid_at >= date_trunc('month', now())), 0)::text AS this_month,
        COALESCE(SUM(amount), 0)::text AS total
      FROM payments WHERE status = 'captured'`);
    return { clinics, subscriptions: subs, bookings, revenue };
  }

  @Get('audit-logs')
  async auditLogs(@Query() q: AuditQuery) {
    const qb = this.ds.getRepository(AuditLog).createQueryBuilder('a').orderBy('a.id', 'DESC').skip((q.page - 1) * q.limit).take(q.limit);
    if (q.entity) qb.andWhere('a.entity = :entity', { entity: q.entity });
    if (q.action) qb.andWhere('a.action = :action', { action: q.action });
    const [items, total] = await qb.getManyAndCount();
    return { items, ...pageMeta(total, q) };
  }
}
