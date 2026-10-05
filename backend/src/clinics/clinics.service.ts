import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, ILike, Repository } from 'typeorm';
import { AuditService } from '../common/audit.service.js';
import { Clock } from '../common/clock.js';
import { ClinicStatus, SubscriptionKind, UserRole } from '../common/enums.js';
import { pageMeta } from '../common/pagination.js';
import { slugify, uniqueSlug } from '../common/slug.js';
import { normalizeMobile } from '../auth/mobile.js';
import { Area, Clinic, ClinicMember, Subscription, User } from '../database/entities/index.js';
import { SettingsService } from '../settings/settings.service.js';
import { SubscriptionsService } from '../subscriptions/subscriptions.service.js';
import { AddMemberDto, CreateClinicDto, ListClinicsQuery, UpdateClinicDto } from './dto.js';

@Injectable()
export class ClinicsService {
  constructor(
    private readonly ds: DataSource,
    @InjectRepository(Clinic) private readonly clinics: Repository<Clinic>,
    @InjectRepository(Area) private readonly areas: Repository<Area>,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
    private readonly subs: SubscriptionsService,
    private readonly clock: Clock,
  ) {}

  private async assertArea(name: string) {
    if (!(await this.areas.exists({ where: { name, isActive: true } }))) {
      throw new BadRequestException(`Unknown area "${name}". Add it under Areas first.`);
    }
  }

  async create(dto: CreateClinicDto, adminId: string): Promise<Clinic> {
    await this.assertArea(dto.area);
    const slug = await uniqueSlug(slugify(dto.name, 'clinic'), (s) => this.clinics.exists({ where: { slug: s } }));
    const clinic = await this.clinics.save(this.clinics.create({ ...dto, slug, createdById: adminId, status: ClinicStatus.PENDING }));
    await this.audit.log(adminId, 'clinic.created', 'clinic', clinic.id, { name: clinic.name });
    return clinic;
  }

  async update(id: string, dto: UpdateClinicDto, adminId: string): Promise<Clinic> {
    const clinic = await this.getOrFail(id);
    if (dto.area && dto.area !== clinic.area) await this.assertArea(dto.area);
    Object.assign(clinic, dto);
    const saved = await this.clinics.save(clinic);
    await this.audit.log(adminId, 'clinic.updated', 'clinic', id, { fields: Object.keys(dto) });
    return saved;
  }

  async getOrFail(id: string): Promise<Clinic> {
    if (!/^\d+$/.test(id)) throw new NotFoundException('Clinic not found');
    const c = await this.clinics.findOne({ where: { id } });
    if (!c) throw new NotFoundException('Clinic not found');
    return c;
  }

  async list(q: ListClinicsQuery) {
    const where: Record<string, unknown> = {};
    if (q.status) where.status = q.status;
    if (q.q) where.name = ILike(`%${q.q.replace(/[%_]/g, '\\$&')}%`);
    const [items, total] = await this.clinics.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (q.page - 1) * q.limit,
      take: q.limit,
    });
    return { items, ...pageMeta(total, q) };
  }

  async detail(id: string) {
    const clinic = await this.clinics.findOne({
      where: { id },
      relations: { images: true, doctors: { specialization: true, schedules: true } },
      order: { images: { sortOrder: 'ASC' } },
    });
    if (!clinic) throw new NotFoundException('Clinic not found');
    const subscriptions = await this.ds.getRepository(Subscription).find({ where: { clinicId: id }, order: { endsAt: 'DESC' } });
    const members = await this.ds.getRepository(ClinicMember).find({ where: { clinicId: id }, relations: { user: true } });
    return {
      ...clinic,
      subscriptions,
      members: members.map((m) => ({ userId: m.userId, role: m.role, name: m.user.name, mobile: m.user.mobile })),
    };
  }

  /** pending/rejected -> approved, and starts the trial (clinic override > global default). */
  async publish(id: string, trialDays: number | undefined, adminId: string) {
    return this.ds.transaction(async (m) => {
      const rows = await m.query('SELECT id FROM clinics WHERE id = $1 FOR UPDATE', [id]);
      if (!rows.length) throw new NotFoundException('Clinic not found');
      const clinic = await m.getRepository(Clinic).findOneByOrFail({ id });
      if (clinic.status === ClinicStatus.APPROVED) throw new ConflictException('Clinic is already published');
      if (clinic.status === ClinicStatus.SUSPENDED) throw new ConflictException('Clinic is suspended. Reactivate it instead.');

      if (trialDays !== undefined) clinic.trialDays = trialDays;
      clinic.status = ClinicStatus.APPROVED;
      clinic.approvedAt = this.clock.now();
      clinic.approvedById = adminId;
      clinic.rejectionReason = null;
      await m.getRepository(Clinic).save(clinic);

      let trial: Subscription | null = null;
      if (!(await this.subs.hasAny(id, m))) {
        const days = clinic.trialDays ?? (await this.settings.getInt('default_trial_days'));
        if (days > 0) {
          trial = await this.subs.extend({ clinicId: id, kind: SubscriptionKind.TRIAL, days, createdBy: adminId }, m);
        }
      }
      await this.audit.log(adminId, 'clinic.published', 'clinic', id, { trialEndsAt: trial?.endsAt ?? null }, m);
      return { clinic, trial };
    });
  }

  async reject(id: string, reason: string, adminId: string) {
    const clinic = await this.getOrFail(id);
    if (clinic.status !== ClinicStatus.PENDING) throw new ConflictException('Only pending clinics can be rejected');
    clinic.status = ClinicStatus.REJECTED;
    clinic.rejectionReason = reason;
    await this.clinics.save(clinic);
    await this.audit.log(adminId, 'clinic.rejected', 'clinic', id, { reason });
    return clinic;
  }

  async suspend(id: string, adminId: string) {
    const clinic = await this.getOrFail(id);
    if (clinic.status !== ClinicStatus.APPROVED) throw new ConflictException('Only published clinics can be suspended');
    clinic.status = ClinicStatus.SUSPENDED;
    await this.clinics.save(clinic);
    await this.audit.log(adminId, 'clinic.suspended', 'clinic', id);
    return clinic;
  }

  async reactivate(id: string, adminId: string) {
    const clinic = await this.getOrFail(id);
    if (clinic.status !== ClinicStatus.SUSPENDED) throw new ConflictException('Only suspended clinics can be reactivated');
    clinic.status = ClinicStatus.APPROVED;
    await this.clinics.save(clinic);
    await this.audit.log(adminId, 'clinic.reactivated', 'clinic', id);
    return clinic;
  }

  /** Free days on top of whatever the clinic has (writes a `gifted` subscription row + audit). */
  async giftDays(id: string, days: number, reason: string | undefined, adminId: string) {
    return this.ds.transaction(async (m) => {
      await this.getOrFail(id);
      const sub = await this.subs.extend({ clinicId: id, kind: SubscriptionKind.GIFTED, days, createdBy: adminId }, m);
      await this.audit.log(adminId, 'subscription.gifted', 'clinic', id, { days, reason, endsAt: sub.endsAt }, m);
      return sub;
    });
  }

  /** Creates (or reuses) the login for an owner/receptionist and links it to this clinic. */
  async addMember(clinicId: string, dto: AddMemberDto, adminId: string) {
    await this.getOrFail(clinicId);
    const mobile = normalizeMobile(dto.mobile);
    const role = dto.role as UserRole;
    return this.ds.transaction(async (m) => {
      let user = await m.getRepository(User).findOne({ where: { mobile } });
      if (user && user.role !== role) {
        throw new ConflictException(`This mobile is already registered as ${user.role}`);
      }
      if (!user) user = await m.getRepository(User).save({ mobile, role, name: dto.name ?? null });
      else if (dto.name && !user.name) await m.getRepository(User).update(user.id, { name: dto.name });
      const existing = await m.getRepository(ClinicMember).findOne({ where: { clinicId, userId: user.id } });
      if (existing) throw new ConflictException('This person is already linked to the clinic');
      await m.getRepository(ClinicMember).insert({ clinicId, userId: user.id, role });
      await this.audit.log(adminId, 'clinic.member_added', 'clinic', clinicId, { userId: user.id, role }, m);
      return { userId: user.id, role, mobile };
    });
  }

  async removeMember(clinicId: string, userId: string, adminId: string) {
    const res = await this.ds.getRepository(ClinicMember).delete({ clinicId, userId });
    if (!res.affected) throw new NotFoundException('Member not found');
    await this.audit.log(adminId, 'clinic.member_removed', 'clinic', clinicId, { userId });
  }
}
