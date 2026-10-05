/* eslint-disable @next/next/no-img-element -- images are already resized WebP served by our API */
import Link from 'next/link';
import { Badge, Card } from '@/components/ui';
import type { ClinicListItem } from '@/lib/types';

export function ClinicCard({ clinic, doctorsLabel }: { clinic: ClinicListItem; doctorsLabel: string }) {
  return (
    <Card className="p-0 transition-shadow hover:shadow-md">
      <Link href={`/clinics/${clinic.slug}`} className="flex gap-3 p-3 sm:gap-4 sm:p-4">
        {clinic.coverThumbUrl ? (
          <img src={clinic.coverThumbUrl} alt="" width={96} height={96} loading="lazy" className="size-20 shrink-0 rounded-lg object-cover sm:size-24" />
        ) : (
          <div aria-hidden className="grid size-20 shrink-0 place-items-center rounded-lg bg-brand-50 text-3xl text-brand-600 sm:size-24 dark:bg-white/5">+</div>
        )}
        <div className="min-w-0 space-y-1">
          <h3 className="truncate text-lg font-semibold">{clinic.name}</h3>
          <p className="truncate text-sm text-muted">{clinic.area}, {clinic.city}</p>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {clinic.specializations.slice(0, 3).map((s) => (
              <Badge key={s} tone="brand">{s}</Badge>
            ))}
            <Badge>{doctorsLabel}</Badge>
          </div>
        </div>
      </Link>
    </Card>
  );
}
