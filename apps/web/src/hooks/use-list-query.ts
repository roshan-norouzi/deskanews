'use client';

import { useMemo } from 'react';
import { useSearchParams } from 'next/navigation';

/** Build query string from URL search params for given keys */
export function useListQuery(keys: string[]): string {
  const searchParams = useSearchParams();
  const keySignature = keys.join('\u0000');

  return useMemo(() => {
    const params = new URLSearchParams();
    for (const key of keySignature ? keySignature.split('\u0000') : []) {
      const value = searchParams.get(key);
      if (value) params.set(key, value);
    }
    return params.toString();
  }, [keySignature, searchParams]);
}

export function appendQueryToPath(path: string, queryString: string): string {
  if (!queryString) return path;
  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}${queryString}`;
}
