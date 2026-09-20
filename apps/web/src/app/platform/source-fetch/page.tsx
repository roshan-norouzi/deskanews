'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function PlatformSourceFetchRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/platform/settings?tab=source-fetch');
  }, [router]);
  return null;
}
