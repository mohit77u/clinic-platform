import { BadRequestException } from '@nestjs/common';

/** Normalises Indian mobiles to E.164 without '+': "98765 43210" / "+91 98765 43210" -> "919876543210". */
export function normalizeMobile(input: string): string {
  const digits = input.replace(/\D/g, '');
  const n = digits.length === 10 ? `91${digits}` : digits;
  if (!/^91[6-9]\d{9}$/.test(n)) throw new BadRequestException('Enter a valid 10-digit Indian mobile number');
  return n;
}
