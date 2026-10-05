import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { DataSource } from 'typeorm';
import { AuditService } from '../common/audit.service.js';
import { Clock } from '../common/clock.js';

export const DOC_TYPES = ['clinic_registration', 'doctor_licence', 'id_proof'] as const;
export const LINK_TTL_MS = 5 * 60_000;

/** Identifies the real file type from magic bytes (the client-supplied name/mimetype is not trusted). */
function sniff(b: Buffer): { ext: string; mime: string } | null {
  if (b.subarray(0, 4).toString('latin1') === '%PDF') return { ext: 'pdf', mime: 'application/pdf' };
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { ext: 'jpg', mime: 'image/jpeg' };
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { ext: 'png', mime: 'image/png' };
  return null;
}

/** KYC documents: stored outside the public uploads folder and only reachable through short-lived signed links. */
@Injectable()
export class DocumentsService {
  private readonly root: string;
  private readonly secret: string;
  private readonly baseUrl: string;

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly clock: Clock,
    private readonly audit: AuditService,
    config: ConfigService,
  ) {
    this.root = resolve(config.getOrThrow<string>('PRIVATE_DIR'));
    this.secret = config.getOrThrow<string>('JWT_SECRET');
    this.baseUrl = config.getOrThrow<string>('PUBLIC_BASE_URL');
  }

  private sign(docId: string, exp: number) {
    return createHmac('sha256', this.secret).update(`doc:${docId}:${exp}`).digest('hex');
  }

  async upload(clinicId: string, docType: string, data: Buffer, adminId: string) {
    if (!(DOC_TYPES as readonly string[]).includes(docType)) throw new BadRequestException(`docType must be one of ${DOC_TYPES.join(', ')}`);
    const kind = sniff(data);
    if (!kind) throw new BadRequestException('Only PDF, JPEG or PNG documents are allowed');
    const [c] = await this.ds.query(`SELECT 1 FROM clinics WHERE id = $1`, [clinicId]);
    if (!c) throw new NotFoundException('Clinic not found');

    const key = `documents/${clinicId}/${randomUUID()}.${kind.ext}`;
    const file = join(this.root, key);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, data);
    const [row] = await this.ds.query(
      `INSERT INTO clinic_documents (clinic_id, doc_type, file_url) VALUES ($1,$2,$3) RETURNING id, doc_type AS "docType", verified, uploaded_at AS "uploadedAt"`,
      [clinicId, docType, key],
    );
    await this.audit.log(adminId, 'document.uploaded', 'clinic', clinicId, { docType, docId: row.id });
    return row;
  }

  list(clinicId: string) {
    return this.ds.query(`SELECT id, doc_type AS "docType", verified, uploaded_at AS "uploadedAt" FROM clinic_documents WHERE clinic_id = $1 ORDER BY id`, [clinicId]);
  }

  async setVerified(docId: string, verified: boolean, adminId: string) {
    const rows = await this.ds.query(`WITH u AS (UPDATE clinic_documents SET verified = $2 WHERE id = $1 RETURNING id, clinic_id) SELECT * FROM u`, [docId, verified]);
    if (!rows.length) throw new NotFoundException('Document not found');
    await this.audit.log(adminId, verified ? 'document.verified' : 'document.unverified', 'clinic', rows[0].clinic_id, { docId });
    return { ok: true };
  }

  async link(clinicId: string, docId: string, adminId: string) {
    const [d] = await this.ds.query(`SELECT id FROM clinic_documents WHERE id = $1 AND clinic_id = $2`, [docId, clinicId]);
    if (!d) throw new NotFoundException('Document not found');
    const exp = this.clock.now().getTime() + LINK_TTL_MS;
    await this.audit.log(adminId, 'document.link_issued', 'clinic', clinicId, { docId });
    return { url: `${this.baseUrl}/documents/${docId}?exp=${exp}&sig=${this.sign(docId, exp)}`, expiresAt: new Date(exp).toISOString() };
  }

  async read(docId: string, exp: number, sig: string) {
    const expected = this.sign(docId, exp);
    const ok = sig.length === expected.length && timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
    if (!ok || !Number.isFinite(exp)) throw new ForbiddenException('Invalid link');
    if (exp < this.clock.now().getTime()) throw new ForbiddenException('Link expired');
    const [d] = await this.ds.query(`SELECT file_url FROM clinic_documents WHERE id = $1`, [docId]);
    if (!d) throw new NotFoundException('Document not found');
    const file = join(this.root, d.file_url);
    if (!file.startsWith(this.root)) throw new ForbiddenException();
    const mime = d.file_url.endsWith('.pdf') ? 'application/pdf' : d.file_url.endsWith('.png') ? 'image/png' : 'image/jpeg';
    return { data: await readFile(file), mime };
  }
}
