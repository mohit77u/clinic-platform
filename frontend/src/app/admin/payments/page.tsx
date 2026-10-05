import { Suspense } from 'react';
import { ListSkeleton } from '@/components/admin/common';
import { PaymentsList } from '@/components/admin/payments-list';

export default function PaymentsPage() {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <PaymentsList />
    </Suspense>
  );
}
