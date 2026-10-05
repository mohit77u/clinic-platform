'use client';

import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Card, Skeleton, cx } from '@/components/ui';
import { ClinicForm } from './clinic-form';
import { ErrorState, StatusBadge } from './common';
import { useFetch } from './hooks';
import { DocumentsTab } from './tab-documents';
import { DoctorsTab } from './tab-doctors';
import { ImagesTab } from './tab-images';
import { LeaveTab } from './tab-leave';
import { SubscriptionTab } from './tab-subscription';
import { TeamTab } from './tab-team';
import type { AdminClinicDetail, AdminDoctor } from './types';

const TABS = [
  { id: 'details', label: 'Details' },
  { id: 'images', label: 'Images' },
  { id: 'doctors', label: 'Doctors' },
  { id: 'leave', label: 'Leave' },
  { id: 'team', label: 'Team' },
  { id: 'documents', label: 'Documents' },
  { id: 'subscription', label: 'Subscription' },
] as const;
type TabId = (typeof TABS)[number]['id'];

export function ClinicView() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const sp = useSearchParams();
  const tabParam = sp.get('tab');
  const tab: TabId = TABS.some((t) => t.id === tabParam) ? (tabParam as TabId) : 'details';

  const detail = useFetch<AdminClinicDetail>(`/admin/clinics/${id}`);
  const doctors = useFetch<AdminDoctor[]>(`/admin/clinics/${id}/doctors`);
  const reloadDetail = detail.reload;
  const reloadDoctors = doctors.reload;
  const reloadAll = () => {
    reloadDetail();
    reloadDoctors();
  };

  const clinic = detail.data;
  const goTab = (t: TabId) => router.replace(`/admin/clinics/${id}?tab=${t}`, { scroll: false });

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/admin/clinics" className="text-brand-700 hover:underline dark:text-brand-100">
          ← All clinics
        </Link>
      </p>
      {detail.error && !clinic ? (
        <ErrorState message={detail.error} onRetry={detail.reload} />
      ) : !clinic ? (
        <div className="space-y-3" aria-busy="true" aria-label="Loading">
          <Skeleton className="h-10 w-2/3" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <>
          <header className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="min-w-0 break-words text-2xl font-semibold">{clinic.name}</h1>
            <StatusBadge status={clinic.status} />
            <span className="text-sm text-muted">/{clinic.slug}</span>
          </header>
          {detail.error && <ErrorState message={detail.error} onRetry={detail.reload} />}

          <div role="tablist" aria-label="Clinic sections" className="mb-4 flex gap-1 overflow-x-auto border-b border-border">
            {TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                id={`tab-${t.id}`}
                aria-selected={tab === t.id}
                aria-controls="tab-panel"
                onClick={() => goTab(t.id)}
                className={cx(
                  'min-h-11 shrink-0 border-b-2 px-3 text-sm font-medium transition-colors',
                  tab === t.id ? 'border-brand-600 text-brand-700 dark:text-brand-100' : 'border-transparent text-muted hover:text-foreground',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div role="tabpanel" id="tab-panel" aria-labelledby={`tab-${tab}`}>
            {tab === 'details' && (
              <Card className="max-w-3xl">
                <ClinicForm key={clinic.updatedAt} clinic={clinic} onSaved={reloadAll} />
              </Card>
            )}
            {tab === 'images' && <ImagesTab clinic={clinic} onChanged={reloadDetail} />}
            {tab === 'doctors' &&
              (doctors.error && !doctors.data ? (
                <ErrorState message={doctors.error} onRetry={doctors.reload} />
              ) : !doctors.data ? (
                <Skeleton className="h-40 w-full" />
              ) : (
                <DoctorsTab clinic={clinic} doctors={doctors.data} onChanged={reloadDoctors} />
              ))}
            {tab === 'leave' &&
              (doctors.error && !doctors.data ? (
                <ErrorState message={doctors.error} onRetry={doctors.reload} />
              ) : !doctors.data ? (
                <Skeleton className="h-40 w-full" />
              ) : (
                <LeaveTab clinic={clinic} doctors={doctors.data} />
              ))}
            {tab === 'team' && <TeamTab clinic={clinic} onChanged={reloadDetail} />}
            {tab === 'documents' && <DocumentsTab clinicId={clinic.id} />}
            {tab === 'subscription' && <SubscriptionTab clinic={clinic} onChanged={reloadAll} />}
          </div>
        </>
      )}
    </>
  );
}
