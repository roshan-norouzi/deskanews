import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export type PageWidth = 'narrow' | 'default' | 'wide';

interface PageContainerProps extends HTMLAttributes<HTMLDivElement> {
  width?: PageWidth;
  as?: 'div' | 'main';
}

const WIDTH: Record<PageWidth, string> = {
  narrow: 'max-w-5xl',
  default: 'max-w-7xl',
  wide: 'max-w-[90rem]',
};

export function PageContainer({
  width = 'default',
  as: Tag = 'div',
  className,
  ...props
}: PageContainerProps) {
  return (
    <Tag
      dir="rtl"
      className={cn('mx-auto w-full space-y-6', WIDTH[width], className)}
      {...props}
    />
  );
}
