import Image from 'next/image';
import Link from 'next/link';
import { PLATFORM_TAGLINE } from '@deska/shared';
import { cn, withBasePath } from '@/lib/utils';

export const PLATFORM_LOGO_PATH = '/brand/deska-logo.png';

const LOGO_ALT = `دسکا — ${PLATFORM_TAGLINE}`;

type PlatformLogoVariant = 'full' | 'header' | 'mark';

interface PlatformLogoProps {
  variant?: PlatformLogoVariant;
  className?: string;
  priority?: boolean;
}

function logoSrc() {
  return withBasePath(PLATFORM_LOGO_PATH);
}

export function PlatformLogo({ variant = 'header', className, priority }: PlatformLogoProps) {
  const src = logoSrc();

  if (variant === 'mark') {
    return (
      <div
        className={cn(
          'relative h-9 w-9 shrink-0 overflow-hidden rounded-lg border border-slate-200/80 bg-white shadow-sm',
          className,
        )}
      >
        <Image
          src={src}
          alt={LOGO_ALT}
          fill
          sizes="36px"
          className="object-cover object-top scale-[1.45]"
          priority={priority}
        />
      </div>
    );
  }

  if (variant === 'full') {
    return (
      <Image
        src={src}
        alt={LOGO_ALT}
        width={240}
        height={150}
        className={cn('h-auto w-[13rem] max-w-full rounded-lg bg-white shadow-sm', className)}
        priority={priority}
      />
    );
  }

  return (
    <Image
      src={src}
      alt={LOGO_ALT}
      width={152}
      height={96}
      className={cn('h-auto max-h-11 w-auto max-w-[9.75rem] rounded-md bg-white px-0.5 shadow-sm', className)}
      priority={priority}
    />
  );
}

interface PlatformBrandLinkProps {
  href?: string;
  collapsed?: boolean;
  className?: string;
}

export function PlatformBrandLink({ href = '/dashboard', collapsed, className }: PlatformBrandLinkProps) {
  return (
    <Link href={href} className={cn('flex min-w-0 items-center', className)} aria-label={LOGO_ALT}>
      <PlatformLogo variant={collapsed ? 'mark' : 'header'} priority />
    </Link>
  );
}
