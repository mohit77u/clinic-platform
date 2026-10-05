import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Clock } from '../common/clock.js';
import { istDate, weekdayOf } from '../common/dates.js';
import { pageMeta } from '../common/pagination.js';
import { thumbUrl } from '../clinics/images.service.js';
import { Clinic, Doctor, DoctorSchedule, Specialization } from '../database/entities/index.js';
import { SearchClinicsQuery } from './dto.js';

const hhmm = (t: string) => t.slice(0, 5);

/** Only whitelisted fields leave the API (no registration no, trial days, creator, status...). */
const publicSchedule = (s: DoctorSchedule) => ({
  id: s.id,
  weekday: s.weekday,
  sessionName: s.sessionName,
  startTime: hhmm(s.startTime),
  endTime: hhmm(s.endTime),
  mode: s.mode,
});

const publicDoctor = (d: Doctor) => ({
  id: d.id,
  slug: d.slug,
  name: d.name,
  qualification: d.qualification,
  experienceYears: d.experienceYears,
  consultationFee: d.consultationFee,
  languages: d.languages,
  bio: d.bio,
  photoUrl: d.photoUrl,
  specialization: d.specialization ? { id: d.specialization.id, name: d.specialization.name, nameHi: d.specialization.nameHi, slug: d.specialization.slug } : undefined,
  schedules: (d.schedules ?? []).filter((s) => s.isActive).sort((a, b) => a.weekday - b.weekday || a.startTime.localeCompare(b.startTime)).map(publicSchedule),
});

const publicClinicCore = (c: Clinic) => ({
  id: c.id,
  slug: c.slug,
  name: c.name,
  description: c.description,
  phone: c.phone,
  whatsapp: c.whatsapp,
  addressLine: c.addressLine,
  area: c.area,
  city: c.city,
  state: c.state,
  pincode: c.pincode,
  mapUrl: c.mapUrl,
  latitude: c.latitude,
  longitude: c.longitude,
  logoUrl: c.logoUrl,
  coverUrl: c.coverUrl,
  coverThumbUrl: c.coverUrl ? thumbUrl(c.coverUrl) : null,
  updatedAt: c.updatedAt,
});

@Injectable()
export class PublicService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly clock: Clock,
  ) {}

  specializations() {
    return this.ds.getRepository(Specialization).find({ order: { name: 'ASC' } });
  }

  async areas() {
    const rows = await this.ds.query(`SELECT a.name FROM areas a WHERE a.is_active ORDER BY a.sort_order, a.name`);
    return rows.map((r: { name: string }) => r.name);
  }

  async searchClinics(q: SearchClinicsQuery) {
    const today = istDate(this.clock.now());
    const params: unknown[] = [];
    const add = (v: unknown) => (params.push(v), `$${params.length}`);
    const where: string[] = [];

    if (q.area) where.push(`c.area = ${add(q.area)}`);
    if (q.specialization) {
      where.push(`EXISTS (SELECT 1 FROM doctors d JOIN specializations s ON s.id = d.specialization_id
        WHERE d.clinic_id = c.id AND d.is_active AND s.slug = ${add(q.specialization)})`);
    }
    if (q.q) {
      const like = add(`%${q.q.replace(/[\\%_]/g, '\\$&')}%`);
      const raw = add(q.q);
      where.push(`(c.name ILIKE ${like} OR c.area ILIKE ${like} OR similarity(c.name, ${raw}) > 0.3
        OR EXISTS (SELECT 1 FROM doctors d JOIN specializations s ON s.id = d.specialization_id
             WHERE d.clinic_id = c.id AND d.is_active AND (d.name ILIKE ${like} OR s.name ILIKE ${like})))`);
    }
    if (q.availableToday) {
      where.push(`EXISTS (SELECT 1 FROM doctors d JOIN doctor_schedules ds ON ds.doctor_id = d.id
        WHERE d.clinic_id = c.id AND d.is_active AND ds.is_active AND ds.weekday = ${add(weekdayOf(today))}
          AND NOT EXISTS (SELECT 1 FROM doctor_leaves l WHERE l.doctor_id = d.id AND l.leave_date = ${add(today)}
                          AND (l.schedule_id IS NULL OR l.schedule_id = ds.id)))`);
    }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const limit = add(q.limit);
    const offset = add((q.page - 1) * q.limit);

    const ids: { id: string }[] = await this.ds.query(
      `SELECT c.id FROM v_public_clinics c ${w} ORDER BY c.name ASC LIMIT ${limit} OFFSET ${offset}`,
      params,
    );
    const [{ count }] = await this.ds.query(`SELECT COUNT(*)::int AS count FROM v_public_clinics c ${w}`, params.slice(0, params.length - 2));

    const order = new Map(ids.map((r, i) => [r.id, i]));
    const clinics = ids.length
      ? await this.ds.getRepository(Clinic).find({
          where: ids.map((r) => ({ id: r.id })),
          relations: { doctors: { specialization: true } },
        })
      : [];
    clinics.sort((a, b) => order.get(a.id)! - order.get(b.id)!);

    return {
      items: clinics.map((c) => ({
        ...publicClinicCore(c),
        specializations: [...new Set(c.doctors.filter((d) => d.isActive).map((d) => d.specialization.name))],
        doctorCount: c.doctors.filter((d) => d.isActive).length,
      })),
      ...pageMeta(count, q),
    };
  }

  /** The clinic, only if the public view lets it through (approved + subscription within grace). */
  private async visibleClinicId(slug: string): Promise<string> {
    const rows: { id: string }[] = await this.ds.query(`SELECT id FROM v_public_clinics WHERE slug = $1`, [slug]);
    if (!rows.length) throw new NotFoundException('Clinic not available');
    return rows[0].id;
  }

  async clinicBySlug(slug: string) {
    const id = await this.visibleClinicId(slug);
    const c = await this.ds.getRepository(Clinic).findOneOrFail({
      where: { id },
      relations: { images: true, doctors: { specialization: true, schedules: true } },
      order: { images: { sortOrder: 'ASC' } },
    });
    return {
      ...publicClinicCore(c),
      images: c.images.map((i) => ({ id: i.id, url: i.imageUrl, thumbUrl: thumbUrl(i.imageUrl), caption: i.caption })),
      doctors: c.doctors.filter((d) => d.isActive).map(publicDoctor),
    };
  }

  async doctorBySlug(slug: string) {
    const d = await this.ds.getRepository(Doctor).findOne({ where: { slug, isActive: true }, relations: { specialization: true, schedules: true, clinic: true } });
    if (!d) throw new NotFoundException('Doctor not available');
    await this.visibleClinicId(d.clinic.slug);
    return { ...publicDoctor(d), clinic: publicClinicCore(d.clinic) };
  }

  async sitemap() {
    const clinics = await this.ds.query(`SELECT slug, updated_at AS "updatedAt" FROM v_public_clinics ORDER BY id`);
    const doctors = await this.ds.query(
      `SELECT d.slug FROM doctors d JOIN v_public_clinics c ON c.id = d.clinic_id WHERE d.is_active ORDER BY d.id`,
    );
    const specializations = await this.ds.query(
      `SELECT DISTINCT s.slug FROM specializations s JOIN doctors d ON d.specialization_id = s.id AND d.is_active
         JOIN v_public_clinics c ON c.id = d.clinic_id ORDER BY s.slug`,
    );
    return { clinics, doctors, specializations };
  }
}
