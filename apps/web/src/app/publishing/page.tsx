'use client';

import Link from 'next/link';
import {
  Activity,
  ArrowLeft,
  ImageIcon,
  Newspaper,
  Rss,
  Settings2,
  Share2,
} from 'lucide-react';
import { ProtectedLayout } from '@/components/layout/protected-layout';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';

const sections = [
  {
    href: '/publishing/feeds',
    title: 'منابع خبری',
    text: 'منابع پیش‌فرض پلتفرم و منابع اختصاصی سازمان را فعال کن و پایش کن.',
    icon: Rss,
    tone: 'bg-emerald-50 text-emerald-700',
  },
  {
    href: '/publishing/news',
    title: 'میز خبر',
    text: 'دریافت، خلاصه‌سازی و انتشار کنترل‌شده خبرها.',
    icon: Newspaper,
    tone: 'bg-blue-50 text-blue-700',
  },
  {
    href: '/publishing/social',
    title: 'استودیوی اجتماعی',
    text: 'آماده‌سازی محتوای مناسب شبکه‌های اجتماعی.',
    icon: Share2,
    tone: 'bg-violet-50 text-violet-700',
  },
  {
    href: '/publishing/media',
    title: 'فایل‌ها',
    text: 'تصاویر و فایل‌های تولیدشده برای انتشار.',
    icon: ImageIcon,
    tone: 'bg-amber-50 text-amber-700',
  },
  {
    href: '/publishing/settings',
    title: 'تنظیمات انتشار',
    text: 'پیش‌فرض‌های پایش خبر، اتصال سایت مقصد و قالب‌های استودیو.',
    icon: Settings2,
    tone: 'bg-slate-100 text-slate-700',
  },
  {
    href: '/publishing/operations',
    title: 'مرکز عملیات',
    text: 'صف فرایندها، سلامت اتصال‌ها و تاریخچه گردش محتوا.',
    icon: Activity,
    tone: 'bg-slate-100 text-slate-700',
  },
];

export default function PublishingPage() {
  return (
    <ProtectedLayout>
      <main className="mx-auto w-full max-w-7xl space-y-6" dir="rtl">
        <PageHeader
          title="مرکز انتشار"
          description="خبر را از منبع بگیر، در میز خبر آماده کن، در سایت یا شبکه‌ها منتشر کن."
          icon={Rss}
        />

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {sections.map(({ href, title, text, icon: Icon, tone }) => (
            <Link href={href} key={href}>
              <Card className="group h-full p-5 transition hover:-translate-y-1 hover:shadow-elevated">
                <span className={`grid h-11 w-11 place-items-center rounded-xl ${tone}`}>
                  <Icon className="h-5 w-5" />
                </span>
                <h2 className="mt-4 text-lg font-bold text-slate-900">{title}</h2>
                <p className="mt-2 min-h-14 text-sm leading-7 text-slate-500">{text}</p>
                <span className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-primary-700">
                  ورود به بخش
                  <ArrowLeft className="h-4 w-4 transition group-hover:-translate-x-1" />
                </span>
              </Card>
            </Link>
          ))}
        </section>
      </main>
    </ProtectedLayout>
  );
}
