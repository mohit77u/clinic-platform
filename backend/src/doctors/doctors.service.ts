import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AuditService } from '../common/audit.service.js';
import { BookingMode } from '../common/enums.js';
import { slugify, uniqueSlug } from '../common/slug.js';
import { FileStorage } from '../common/storage.js';
import { processAndStore } from '../clinics/images.service.js';
import { Appointment, Clinic, Doctor, DoctorSchedule, Specialization } from '../database/entities/index.js';
import { CreateDoctorDto, CreateScheduleDto, UpdateDoctorDto, UpdateScheduleDto } from './dto.js';

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

@Injectable()
export class DoctorsService {
  constructor(
    private readonly ds: DataSource,
    @InjectRepository(Doctor) private readonly doctors: Repository<Doctor>,
    @InjectRepository(DoctorSchedule) private readonly schedules: Repository<DoctorSchedule>,
    private readonly audit: AuditService,
    private readonly storage: FileStorage,
  ) {}

  async create(clinicId: string, dto: CreateDoctorDto, adminId: string): Promise<Doctor> {
    if (!(await this.ds.getRepository(Clinic).exists({ where: { id: clinicId } }))) throw new NotFoundException('Clinic not found');
    if (!(await this.ds.getRepository(Specialization).exists({ where: { id: dto.specializationId } }))) {
      throw new BadRequestException('Unknown specialization');
    }
    const slug = await uniqueSlug(slugify(dto.name, 'doctor'), (s) => this.doctors.exists({ where: { slug: s } }));
    const doctor = await this.doctors.save(this.doctors.create({ ...dto, clinicId, slug, languages: dto.languages ?? [] }));
    await this.audit.log(adminId, 'doctor.created', 'doctor', doctor.id, { clinicId });
    return doctor;
  }

  async getOrFail(id: string): Promise<Doctor> {
    if (!/^\d+$/.test(id)) throw new NotFoundException('Doctor not found');
    const d = await this.doctors.findOne({ where: { id } });
    if (!d) throw new NotFoundException('Doctor not found');
    return d;
  }

  async update(id: string, dto: UpdateDoctorDto, adminId: string): Promise<Doctor> {
    const doctor = await this.getOrFail(id);
    if (dto.specializationId && !(await this.ds.getRepository(Specialization).exists({ where: { id: dto.specializationId } }))) {
      throw new BadRequestException('Unknown specialization');
    }
    Object.assign(doctor, dto);
    const saved = await this.doctors.save(doctor);
    await this.audit.log(adminId, 'doctor.updated', 'doctor', id, { fields: Object.keys(dto) });
    return saved;
  }

  listForClinic(clinicId: string) {
    return this.doctors.find({ where: { clinicId }, relations: { specialization: true, schedules: true }, order: { name: 'ASC' } });
  }

  async setPhoto(id: string, data: Buffer, adminId: string): Promise<Doctor> {
    const doctor = await this.getOrFail(id);
    doctor.photoUrl = await processAndStore(this.storage, `doctors/${id}`, data, { max: 800, thumb: 200 });
    await this.doctors.save(doctor);
    await this.audit.log(adminId, 'doctor.photo_updated', 'doctor', id);
    return doctor;
  }

  // ---- schedules ----

  private validateShape(s: Pick<DoctorSchedule, 'startTime' | 'endTime' | 'mode' | 'slotMinutes' | 'maxTokens' | 'walkinReserved'>) {
    const start = toMin(s.startTime);
    const end = toMin(s.endTime);
    if (end <= start) throw new BadRequestException('End time must be after start time');
    if (s.walkinReserved >= s.maxTokens) throw new BadRequestException('Walk-in reserved tokens must be fewer than max tokens');
    if (s.mode === BookingMode.SLOT) {
      if (!s.slotMinutes) throw new BadRequestException('Slot mode needs slotMinutes');
      if (s.maxTokens * s.slotMinutes > end - start) throw new BadRequestException('Slots do not fit in the session time');
    }
  }

  /** Overlap is checked while holding a lock on the doctor row, so two admins cannot race past each other. */
  private async assertNoOverlap(
    m: import('typeorm').EntityManager,
    doctorId: string,
    weekday: number,
    startTime: string,
    endTime: string,
    ignoreId?: string,
  ) {
    await m.query('SELECT id FROM doctors WHERE id = $1 FOR UPDATE', [doctorId]);
    const rows = await m.getRepository(DoctorSchedule).find({ where: { doctorId, weekday, isActive: true } });
    const clash = rows.find((r) => r.id !== ignoreId && toMin(startTime) < toMin(r.endTime) && toMin(endTime) > toMin(r.startTime));
    if (clash) {
      throw new ConflictException(`Overlaps with "${clash.sessionName}" (${clash.startTime.slice(0, 5)}–${clash.endTime.slice(0, 5)}) on the same day`);
    }
  }

  async addSchedule(doctorId: string, dto: CreateScheduleDto, adminId: string): Promise<DoctorSchedule> {
    await this.getOrFail(doctorId);
    const candidate = {
      doctorId,
      weekday: dto.weekday,
      sessionName: dto.sessionName ?? 'Session',
      startTime: dto.startTime,
      endTime: dto.endTime,
      mode: (dto.mode ?? 'token') as BookingMode,
      slotMinutes: dto.slotMinutes ?? null,
      maxTokens: dto.maxTokens,
      walkinReserved: dto.walkinReserved ?? 0,
      isActive: dto.isActive ?? true,
    };
    this.validateShape(candidate);
    return this.ds.transaction(async (m) => {
      if (candidate.isActive) await this.assertNoOverlap(m, doctorId, candidate.weekday, candidate.startTime, candidate.endTime);
      const saved = await m.getRepository(DoctorSchedule).save(candidate);
      await this.audit.log(adminId, 'schedule.created', 'doctor_schedule', saved.id, { doctorId }, m);
      return saved;
    });
  }

  async updateSchedule(id: string, dto: UpdateScheduleDto, adminId: string): Promise<DoctorSchedule> {
    const existing = await this.schedules.findOne({ where: { id } });
    if (!existing) throw new NotFoundException('Schedule not found');
    const merged = { ...existing, ...Object.fromEntries(Object.entries(dto).filter(([, v]) => v !== undefined)) } as DoctorSchedule;
    this.validateShape(merged);
    return this.ds.transaction(async (m) => {
      if (merged.isActive) await this.assertNoOverlap(m, merged.doctorId, merged.weekday, merged.startTime, merged.endTime, id);
      const saved = await m.getRepository(DoctorSchedule).save(merged);
      await this.audit.log(adminId, 'schedule.updated', 'doctor_schedule', id, { fields: Object.keys(dto) }, m);
      return saved;
    });
  }

  /** Schedules that have bookings are deactivated (history stays valid); unused ones are deleted. */
  async removeSchedule(id: string, adminId: string): Promise<{ deleted: boolean }> {
    const existing = await this.schedules.findOne({ where: { id } });
    if (!existing) throw new NotFoundException('Schedule not found');
    const used = await this.ds.getRepository(Appointment).exists({ where: { scheduleId: id } });
    if (used) {
      await this.schedules.update(id, { isActive: false });
    } else {
      await this.ds.query('DELETE FROM doctor_leaves WHERE schedule_id = $1', [id]);
      await this.ds.query('DELETE FROM token_counters WHERE schedule_id = $1', [id]);
      await this.schedules.delete(id);
    }
    await this.audit.log(adminId, used ? 'schedule.deactivated' : 'schedule.deleted', 'doctor_schedule', id);
    return { deleted: !used };
  }
}
