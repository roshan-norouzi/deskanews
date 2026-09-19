'use client';

import Link from 'next/link';
import { ArrowLeft, ImageIcon } from 'lucide-react';
import { ProtectedLayout } from '@/components/layout/protected-layout';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';

export default function PublishingMediaPage() {
  return (
    <ProtectedLayout title="فایل‌ها">
      <main className="mx-auto w-full max-w-3xl space-y-6 p-4 sm:p-6" dir="rtl">
        <PageHeader
          title="فایل‌ها"
          description="تصاویر و فایل‌های تولیدشده برای انتشار در سایت و شبکه‌های اجتماعی."
          icon={ImageIcon}
        />
        <Card className="flex flex-col items-center px-6 py-16 text-center">
          <span className="grid h-16 w-16 place-items-center rounded-2xl bg-slate-100 text-slate-400">
            <ImageIcon className="h-8 w-8" />
          </span>
          <h2 className="mt-4 text-lg font-semibold text-slate-900">هنوز فایلی اینجا نیست</h2>
          <p className="mt-2 max-w-md text-sm leading-7 text-slate-500">
            تصاویر کاور و فایل‌های تولیدشده در استودیوی اجتماعی و اتاق خبر اینجا نمایش داده می‌شوند.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link
              href="/publishing/social"
              className="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-primary-700"
            >
              رفتن به استودیوی اجتماعی
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <Link
              href="/publishing/news"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              رفتن به اتاق خبر
            </Link>
          </div>
        </Card>
      </main>
    </ProtectedLayout>
  );
}
