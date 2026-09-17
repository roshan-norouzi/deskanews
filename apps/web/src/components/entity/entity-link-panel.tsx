'use client';

import Link from 'next/link';
import { CONTACT_RELATED_LINKS } from '@deska/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface EntityLinkPanelProps {
  contactId: string;
  title?: string;
}

export function EntityLinkPanel({ contactId, title = 'فعالیت‌های مرتبط' }: EntityLinkPanelProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        {CONTACT_RELATED_LINKS.map((link) => (
          <Link
            key={link.label}
            href={link.href(contactId)}
            className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700"
          >
            {link.label}
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
