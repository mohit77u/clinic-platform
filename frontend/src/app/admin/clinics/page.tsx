import { Suspense } from 'react';
import { ClinicsList } from '@/components/admin/clinics-list';
import { ListSkeleton } from '@/components/admin/common';

export default function ClinicsPage() {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <ClinicsList />
    </Suspense>
  );
}
