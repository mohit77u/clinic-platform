import { randomBytes } from 'node:crypto';

export function slugify(input: string, fallback: string): string {
  const s = input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return s || `${fallback}-${randomBytes(2).toString('hex')}`;
}

/** Returns `base`, or `base-2`, `base-3`... until `exists` says it is free. */
export async function uniqueSlug(base: string, exists: (slug: string) => Promise<boolean>): Promise<string> {
  let slug = base;
  for (let i = 2; await exists(slug); i++) slug = `${base}-${i}`;
  return slug;
}
