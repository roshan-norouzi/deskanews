import { resolveFeedSourceHref } from '@deska/shared';
import { cn } from '@/lib/utils';

interface FeedSourceTitleLinkProps {
  name: string;
  url?: string;
  sourceType?: string;
  className?: string;
}

export function FeedSourceTitleLink({ name, url, sourceType, className }: FeedSourceTitleLinkProps) {
  const href = resolveFeedSourceHref(url || '', sourceType);
  if (!href) {
    return <span className={className}>{name}</span>;
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn('text-inherit hover:text-primary-700 hover:underline', className)}
      title={href}
    >
      {name}
    </a>
  );
}
