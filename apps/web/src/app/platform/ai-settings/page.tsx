'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function PlatformAiSettingsRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/platform/settings?tab=ai');
  }, [router]);
  return null;
}
