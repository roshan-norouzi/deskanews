'use client';

import { useState } from 'react';
import { usesFeedProfilePhoto } from '@deska/shared';
import { cn, withBasePath } from '@/lib/utils';
import { feedSourceMeta } from '@/lib/feed-source-types';

interface FeedSourceLogoProps {
  name: string;
  logoUrl?: string;
  sourceType?: string;
  size?: 'sm' | 'md' | 'lg';
  enabled?: boolean;
  className?: string;
}

const sizeClasses = {
  sm: 'h-9 w-9',
  md: 'h-11 w-11',
  lg: 'h-14 w-14',
} as const;

const iconClasses = {
  sm: 'h-4 w-4',
  md: 'h-5 w-5',
  lg: 'h-6 w-6',
} as const;

function displayLogoSrc(logoUrl?: string) {
  const value = String(logoUrl || '').trim();
  if (!value) return '';
  if (value.startsWith('/')) return withBasePath(value);
  try {
    const parsed = new URL(value);
    if ((parsed.hostname === 'www.google.com' || parsed.hostname === 'google.com') && parsed.pathname.includes('/s2/favicons')) {
      const domain = parsed.searchParams.get('domain');
      if (domain) return withBasePath(`/api/publishing/source-icons/${encodeURIComponent(domain)}`);
    }
  } catch {
    return value;
  }
  return value;
}

function logoImageClass(sourceType: string | undefined, enabled: boolean) {
  const profile = usesFeedProfilePhoto(sourceType);
  return cn(
    'shrink-0 border',
    profile ? 'rounded-full object-cover' : 'rounded-xl object-contain p-1',
    enabled ? 'border-slate-200 bg-white' : 'border-slate-100 bg-slate-100 grayscale',
  );
}

export function FeedSourceLogo({
  name,
  logoUrl,
  sourceType,
  size = 'md',
  enabled = true,
  className,
}: FeedSourceLogoProps) {
  const [failed, setFailed] = useState(false);
  const meta = feedSourceMeta(sourceType);
  const Icon = meta.icon;
  const profile = usesFeedProfilePhoto(sourceType);

  const src = displayLogoSrc(logoUrl);
  if (src && !failed) {
    return (
      <img
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        className={cn(logoImageClass(sourceType, enabled), sizeClasses[size], className)}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <div
      className={cn(
        'grid shrink-0 place-items-center border',
        profile ? 'rounded-full' : 'rounded-xl',
        enabled ? 'border-slate-200 bg-slate-100 text-slate-500' : 'border-slate-100 bg-slate-50 text-slate-400',
        sizeClasses[size],
        className,
      )}
      aria-hidden
    >
      <Icon className={iconClasses[size]} />
    </div>
  );
}

function fallbackInitials(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return '؟';
  const latin = trimmed.match(/[A-Za-z]/g);
  if (latin && latin.length >= 2) return (latin[0] + latin[1]).toUpperCase();
  return trimmed.slice(0, 2);
}

export function FeedSourceLogoWithFallback({
  name,
  logoUrl,
  sourceType,
  size = 'md',
  enabled = true,
  className,
}: FeedSourceLogoProps) {
  const [failed, setFailed] = useState(false);
  const meta = feedSourceMeta(sourceType);
  const Icon = meta.icon;
  const profile = usesFeedProfilePhoto(sourceType);

  const src = displayLogoSrc(logoUrl);
  if (src && !failed) {
    return (
      <img
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        className={cn(logoImageClass(sourceType, enabled), sizeClasses[size], className)}
        onError={() => setFailed(true)}
      />
    );
  }

  if (src && failed) {
    return (
      <div
        className={cn(
          'grid shrink-0 place-items-center border text-xs font-bold',
          profile ? 'rounded-full' : 'rounded-xl',
          enabled ? 'border-slate-200 bg-primary-50 text-primary-700' : 'border-slate-100 bg-slate-50 text-slate-400',
          sizeClasses[size],
          className,
        )}
        aria-hidden
      >
        {fallbackInitials(name)}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'grid shrink-0 place-items-center border',
        profile ? 'rounded-full' : 'rounded-xl',
        enabled ? 'border-slate-200 bg-slate-100 text-slate-500' : 'border-slate-100 bg-slate-50 text-slate-400',
        sizeClasses[size],
        className,
      )}
      aria-hidden
    >
      <Icon className={iconClasses[size]} />
    </div>
  );
}
