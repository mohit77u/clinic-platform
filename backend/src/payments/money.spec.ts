import { addMonths } from '../common/dates.js';
import { financialYear, fromPaise, priceWithGst, toPaise } from './money.js';

describe('money', () => {
  it('computes GST in integer paise', () => {
    expect(priceWithGst('1199', '18')).toEqual({ basePaise: 119900, gstPaise: 21582, totalPaise: 141482, gstPercent: 18 });
    expect(fromPaise(priceWithGst('9999', 18).totalPaise)).toBe('11798.82');
  });
  it('converts without float drift', () => {
    expect(toPaise('0.1') + toPaise('0.2')).toBe(30);
    expect(toPaise('1199.00')).toBe(119900);
  });
  it('financial year flips on 1 April', () => {
    expect(financialYear('2026-03-31')).toBe('2025-26');
    expect(financialYear('2026-04-01')).toBe('2026-27');
    expect(financialYear('2026-12-31')).toBe('2026-27');
    expect(financialYear('2099-04-01')).toBe('2099-00');
  });
});

describe('addMonths', () => {
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  it('clamps to month end', () => {
    expect(iso(addMonths(new Date('2026-01-31T00:00:00Z'), 1))).toBe('2026-02-28');
    expect(iso(addMonths(new Date('2028-01-31T00:00:00Z'), 1))).toBe('2028-02-29');
  });
  it('handles year rollover and long plans', () => {
    expect(iso(addMonths(new Date('2026-11-15T00:00:00Z'), 3))).toBe('2027-02-15');
    expect(iso(addMonths(new Date('2026-10-05T00:00:00Z'), 12))).toBe('2027-10-05');
  });
});
