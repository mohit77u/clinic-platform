import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import PDFDocument from 'pdfkit';
import { DataSource } from 'typeorm';
import { istDate } from '../common/dates.js';
import { fromPaise, toPaise } from './money.js';

const dmy = (d: Date | string) => {
  const s = typeof d === 'string' ? d : istDate(d);
  return `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;
};

/** Server-side GST invoice PDFs, stored in the private directory (never served statically). */
@Injectable()
export class InvoiceService {
  private readonly logger = new Logger(InvoiceService.name);
  private readonly root: string;
  private readonly seller: { name: string; gstin: string; address: string; state: string };

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    config: ConfigService,
  ) {
    this.root = resolve(config.getOrThrow<string>('PRIVATE_DIR'));
    this.seller = {
      name: config.getOrThrow('COMPANY_NAME'),
      gstin: config.getOrThrow('COMPANY_GSTIN'),
      address: config.getOrThrow('COMPANY_ADDRESS'),
      state: config.getOrThrow('COMPANY_STATE'),
    };
  }

  private fileFor(invoiceNo: string) {
    return join(this.root, 'invoices', `${invoiceNo.replace(/[^A-Za-z0-9-]/g, '_')}.pdf`);
  }

  /** Renders and stores the PDF; safe to call again (overwrites with identical content). */
  async generate(paymentId: string): Promise<string> {
    const [p] = await this.ds.query(
      `SELECT p.id, p.invoice_no, p.amount, p.gst_amount, p.paid_at, p.method, p.reference,
              c.name AS clinic_name, c.address_line, c.area, c.city, c.state, c.phone,
              pl.name AS plan_name, pl.duration_months, pl.gst_percent,
              s.starts_at, s.ends_at
         FROM payments p JOIN clinics c ON c.id = p.clinic_id JOIN plans pl ON pl.id = p.plan_id
         LEFT JOIN subscriptions s ON s.id = p.subscription_id
        WHERE p.id = $1 AND p.status = 'captured' AND p.invoice_no IS NOT NULL`,
      [paymentId],
    );
    if (!p) throw new NotFoundException('Invoice not available');

    const total = toPaise(p.amount);
    const gst = toPaise(p.gst_amount);
    const base = total - gst;
    const sameState = p.state.trim().toLowerCase() === this.seller.state.trim().toLowerCase();
    const half = Math.floor(gst / 2);

    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const done = new Promise<void>((r) => doc.on('end', () => r()));

    doc.fontSize(20).text('TAX INVOICE', { align: 'right' });
    doc.moveDown(0.5).fontSize(10).text(`Invoice no: ${p.invoice_no}`, { align: 'right' }).text(`Date: ${dmy(new Date(p.paid_at))}`, { align: 'right' });
    doc.moveDown().fontSize(14).text(this.seller.name);
    doc.fontSize(10).text(this.seller.address).text(`GSTIN: ${this.seller.gstin}`);
    doc.moveDown().fontSize(11).text('Billed to', { underline: true });
    doc.fontSize(10).text(p.clinic_name).text(`${p.address_line}, ${p.area}, ${p.city}, ${p.state}`).text(`Phone: ${p.phone}`);
    doc.moveDown();
    const period = p.starts_at ? ` (${dmy(new Date(p.starts_at))} to ${dmy(new Date(p.ends_at))})` : '';
    doc.text(`Platform subscription: ${p.plan_name}, ${p.duration_months} month(s)${period}`);
    doc.moveDown();
    const row = (label: string, value: string) => doc.text(`${label.padEnd(28)} Rs. ${value}`);
    row('Taxable value', fromPaise(base));
    if (sameState) {
      row(`CGST @ ${Number(p.gst_percent) / 2}%`, fromPaise(half));
      row(`SGST @ ${Number(p.gst_percent) / 2}%`, fromPaise(gst - half));
    } else {
      row(`IGST @ ${Number(p.gst_percent)}%`, fromPaise(gst));
    }
    doc.font('Helvetica-Bold');
    row('Total', fromPaise(total));
    doc.font('Helvetica').moveDown().fontSize(9).text(`Payment method: ${p.method}${p.reference ? ` (${p.reference})` : ''}. This is a computer generated invoice.`);
    doc.end();
    await done;

    const file = this.fileFor(p.invoice_no);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, Buffer.concat(chunks));
    const key = `invoices/${file.split('/').pop()}`;
    await this.ds.query(`UPDATE payments SET invoice_url = $2 WHERE id = $1`, [paymentId, key]);
    return file;
  }

  /** Returns the stored PDF, generating it first if it is missing. Caller must have checked clinic ownership. */
  async read(clinicId: string, paymentId: string): Promise<{ data: Buffer; invoiceNo: string }> {
    const [p] = await this.ds.query(`SELECT id, invoice_no FROM payments WHERE id = $1 AND clinic_id = $2 AND status = 'captured'`, [paymentId, clinicId]);
    if (!p?.invoice_no) throw new NotFoundException('Invoice not available');
    const file = this.fileFor(p.invoice_no);
    try {
      return { data: await readFile(file), invoiceNo: p.invoice_no };
    } catch {
      this.logger.warn(`Invoice ${p.invoice_no} missing on disk, regenerating`);
      await this.generate(p.id);
      return { data: await readFile(file), invoiceNo: p.invoice_no };
    }
  }
}
