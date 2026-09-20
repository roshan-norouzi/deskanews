'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function PlatformUsageMetricsRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/platform/settings?tab=usage');
  }, [router]);
  return null;
}
