'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ClinicForm } from '@/components/admin/clinic-form';
import { PageHeader } from '@/components/admin/common';
import { Card } from '@/components/ui';

export default function NewClinicPage() {
  const router = useRouter();
  return (
    <>
      <PageHeader title="New clinic" subtitle="The clinic starts as pending. Publish it from its Subscription tab once ready." />
      <Card className="max-w-3xl">
        <ClinicForm onSaved={(c) => router.push(`/admin/clinics/${c.id}`)} />
      </Card>
      <p className="mt-4 text-sm">
        <Link href="/admin/clinics" className="text-brand-700 hover:underline dark:text-brand-100">
          Back to clinics
        </Link>
      </p>
    </>
  );
}
