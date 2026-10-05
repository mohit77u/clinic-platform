/** Integer-paise helpers: never do currency arithmetic on floats. */
export const toPaise = (rupees: string | number): number => Math.round(Number(rupees) * 100);
export const fromPaise = (paise: number): string => (paise / 100).toFixed(2);

export interface Pricing {
  basePaise: number;
  gstPaise: number;
  totalPaise: number;
  gstPercent: number;
}

export function priceWithGst(price: string | number, gstPercent: string | number): Pricing {
  const basePaise = toPaise(price);
  const pct = Number(gstPercent);
  const gstPaise = Math.round((basePaise * pct) / 100);
  return { basePaise, gstPaise, totalPaise: basePaise + gstPaise, gstPercent: pct };
}

/** Indian financial year label for an IST date string: 2026-04-01 -> "2026-27", 2026-03-31 -> "2025-26". */
export function financialYear(istDate: string): string {
  const year = Number(istDate.slice(0, 4));
  const month = Number(istDate.slice(5, 7));
  const start = month >= 4 ? year : year - 1;
  return `${start}-${String(start + 1).slice(2)}`;
}
