import type { MetadataRoute } from 'next';
import { API_URL, SITE_URL } from '@/lib/config';

interface SitemapData {
  clinics: { slug: string; updatedAt: string }[];
  doctors: { slug: string }[];
  specializations: { slug: string }[];
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  let data: SitemapData = { clinics: [], doctors: [], specializations: [] };
  try {
    const res = await fetch(`${API_URL}/sitemap-data`, { next: { revalidate: 300 } });
    if (res.ok) data = await res.json();
  } catch {
    /* API down: still serve the static entries */
  }
  return [
    { url: `${SITE_URL}/`, changeFrequency: 'daily', priority: 1 },
    ...data.specializations.map((s) => ({ url: `${SITE_URL}/rewa/${s.slug}`, changeFrequency: 'daily' as const, priority: 0.8 })),
    ...data.clinics.map((c) => ({ url: `${SITE_URL}/clinics/${c.slug}`, lastModified: c.updatedAt, changeFrequency: 'weekly' as const, priority: 0.7 })),
    ...data.doctors.map((d) => ({ url: `${SITE_URL}/doctors/${d.slug}`, changeFrequency: 'weekly' as const, priority: 0.6 })),
    { url: `${SITE_URL}/privacy`, priority: 0.2 },
    { url: `${SITE_URL}/terms`, priority: 0.2 },
  ];
}
