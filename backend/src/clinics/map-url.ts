const ALLOWED_HOSTS = new Set(['maps.app.goo.gl', 'goo.gl', 'maps.google.com', 'google.com', 'www.google.com']);

/** Accepts only Google Maps share links (https). */
export function isAllowedMapUrl(value: string): boolean {
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:' || !ALLOWED_HOSTS.has(u.hostname)) return false;
  if (u.hostname === 'google.com' || u.hostname === 'www.google.com') return u.pathname.startsWith('/maps');
  if (u.hostname === 'goo.gl') return u.pathname.startsWith('/maps');
  return true;
}
