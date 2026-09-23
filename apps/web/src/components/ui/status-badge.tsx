import { Badge, type BadgeProps } from '@/components/ui/badge';

export type StatusTone = 'success' | 'warning' | 'danger' | 'neutral' | 'info';

const TONE_VARIANT: Record<StatusTone, BadgeProps['variant']> = {
  success: 'success',
  warning: 'warning',
  danger: 'danger',
  neutral: 'default',
  info: 'info',
};

interface StatusBadgeProps {
  tone: StatusTone;
  children: React.ReactNode;
  className?: string;
}

export function StatusBadge({ tone, children, className }: StatusBadgeProps) {
  return (
    <Badge variant={TONE_VARIANT[tone]} className={className}>
      {children}
    </Badge>
  );
}
