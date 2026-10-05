import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { DataSource, Repository } from 'typeorm';
import { FileStorage } from '../common/storage.js';
import { Clinic, ClinicImage } from '../database/entities/index.js';

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_CLINIC_IMAGES = 12;
const ACCEPTED = new Set(['jpeg', 'png', 'webp']);

/** `.../abc.webp` -> `.../abc-thumb.webp` (thumb is written next to every image). */
export const thumbUrl = (url: string) => url.replace(/\.webp$/, '-thumb.webp');

/** Validates the bytes are really a jpeg/png/webp, then writes a 1600px WebP and a 400px thumb. */
export async function processAndStore(
  storage: FileStorage,
  dir: string,
  data: Buffer,
  opts = { max: 1600, thumb: 400 },
): Promise<string> {
  let format: string | undefined;
  try {
    format = (await sharp(data).metadata()).format;
  } catch {
    throw new BadRequestException('File is not a valid image');
  }
  if (!format || !ACCEPTED.has(format)) throw new BadRequestException('Only JPEG, PNG or WebP images are allowed');

  const id = randomUUID();
  const base = sharp(data, { limitInputPixels: 40_000_000 }).rotate();
  const full = await base.clone().resize({ width: opts.max, height: opts.max, fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
  const small = await base.clone().resize({ width: opts.thumb, height: opts.thumb, fit: 'inside', withoutEnlargement: true }).webp({ quality: 75 }).toBuffer();
  const url = await storage.put(`${dir}/${id}.webp`, full);
  await storage.put(`${dir}/${id}-thumb.webp`, small);
  return url;
}

@Injectable()
export class ClinicImagesService {
  constructor(
    private readonly ds: DataSource,
    private readonly storage: FileStorage,
    @InjectRepository(ClinicImage) private readonly images: Repository<ClinicImage>,
  ) {}

  async add(clinicId: string, data: Buffer, caption?: string): Promise<ClinicImage> {
    const count = await this.images.count({ where: { clinicId } });
    if (count >= MAX_CLINIC_IMAGES) throw new BadRequestException(`A clinic can have at most ${MAX_CLINIC_IMAGES} images`);
    const url = await processAndStore(this.storage, `clinics/${clinicId}`, data);
    return this.ds.transaction(async (m) => {
      const last = await m.getRepository(ClinicImage).createQueryBuilder('i').select('COALESCE(MAX(i.sort_order), -1)', 'max').where('i.clinic_id = :clinicId', { clinicId }).getRawOne<{ max: number }>();
      const image = await m.getRepository(ClinicImage).save({ clinicId, imageUrl: url, caption: caption ?? null, sortOrder: Number(last?.max ?? -1) + 1 });
      // First image becomes the cover automatically.
      const clinic = await m.getRepository(Clinic).findOneByOrFail({ id: clinicId });
      if (!clinic.coverUrl) await m.getRepository(Clinic).update(clinicId, { coverUrl: url });
      return image;
    });
  }

  async list(clinicId: string) {
    return this.images.find({ where: { clinicId }, order: { sortOrder: 'ASC', id: 'ASC' } });
  }

  async remove(clinicId: string, imageId: string): Promise<void> {
    const img = await this.images.findOne({ where: { id: imageId, clinicId } });
    if (!img) throw new NotFoundException('Image not found');
    await this.ds.transaction(async (m) => {
      await m.getRepository(ClinicImage).delete(img.id);
      const clinic = await m.getRepository(Clinic).findOneByOrFail({ id: clinicId });
      if (clinic.coverUrl === img.imageUrl) {
        const next = await m.getRepository(ClinicImage).findOne({ where: { clinicId }, order: { sortOrder: 'ASC' } });
        await m.getRepository(Clinic).update(clinicId, { coverUrl: next?.imageUrl ?? null });
      }
    });
  }

  async reorder(clinicId: string, ids: string[]): Promise<void> {
    const existing = await this.images.find({ where: { clinicId } });
    const known = new Set(existing.map((i) => i.id));
    if (ids.length !== known.size || ids.some((id) => !known.has(id)) || new Set(ids).size !== ids.length) {
      throw new BadRequestException('Order must list every image of this clinic exactly once');
    }
    await this.ds.transaction(async (m) => {
      for (const [i, id] of ids.entries()) await m.getRepository(ClinicImage).update(id, { sortOrder: i });
    });
  }

  async setCover(clinicId: string, imageId: string): Promise<void> {
    const img = await this.images.findOne({ where: { id: imageId, clinicId } });
    if (!img) throw new NotFoundException('Image not found');
    await this.ds.getRepository(Clinic).update(clinicId, { coverUrl: img.imageUrl });
  }
}
