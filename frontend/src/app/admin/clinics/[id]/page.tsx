import { Suspense } from 'react';
import { ClinicView } from '@/components/admin/clinic-view';
import { ListSkeleton } from '@/components/admin/common';

export default function ClinicDetailPage() {
  return (
    <Suspense fallback={<ListSkeleton rows={3} />}>
      <ClinicView />
    </Suspense>
  );
}
