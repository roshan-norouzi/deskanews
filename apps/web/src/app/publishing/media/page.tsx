'use client';

import Link from 'next/link';
import { ArrowLeft, ImageIcon } from 'lucide-react';
import { ProtectedLayout } from '@/components/layout/protected-layout';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageContainer } from '@/components/ui/page-container';
import { PageHeader } from '@/components/ui/page-header';

export default function PublishingMediaPage() {
  return (
    <ProtectedLayout>
      <PageContainer width="narrow">
        <PageHeader
          title="فایل‌ها"
          description="تصاویر و فایل‌های تولیدشده برای انتشار در سایت و شبکه‌های اجتماعی."
          icon={ImageIcon}
        />
        <Card className="flex flex-col items-center px-6 py-16 text-center">
          <span className="grid h-16 w-16 place-items-center rounded-2xl bg-slate-100 text-slate-400">
            <ImageIcon className="h-8 w-8" />
          </span>
          <h2 className="mt-4 text-lg font-semibold text-slate-900">هنوز فایلی ثبت نشده است</h2>
          <p className="mt-2 max-w-md text-sm leading-7 text-slate-500">
            تصاویر کاور و فایل‌های تولیدشده در استودیوی اجتماعی و میز خبر اینجا نمایش داده می‌شوند.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link href="/publishing/social">
              <Button>
                رفتن به استودیوی اجتماعی
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/publishing/news">
              <Button variant="outline">رفتن به میز خبر</Button>
            </Link>
          </div>
        </Card>
      </PageContainer>
    </ProtectedLayout>
  );
}
