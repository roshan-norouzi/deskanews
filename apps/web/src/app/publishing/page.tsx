'use client';

import Link from 'next/link';
import { ArrowLeft, Newspaper, Rss, Settings2, Share2 } from 'lucide-react';
import { ProtectedLayout } from '@/components/layout/protected-layout';
import { Card } from '@/components/ui/card';

const sections = [
  {
    href: '/publishing/news',
    title: 'اتاق خبر',
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
];

export default function PublishingPage() {
  return (
    <ProtectedLayout title="نشر هوشمند">
      <main className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6" dir="rtl">
        <header className="rounded-3xl bg-gradient-to-l from-slate-950 via-slate-900 to-indigo-950 p-6 text-white shadow-xl shadow-slate-900/10 sm:p-8">
          <div className="flex items-start gap-4">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/15">
              <Rss className="h-6 w-6" />
            </span>
            <div>
              <h1 className="text-2xl font-bold">نشر هوشمند</h1>
              <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-300">
                مدیریت یکپارچه محتوای سازمان.
              </p>
            </div>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {sections.map(({ href, title, text, icon: Icon, tone }) => (
            <Link href={href} key={href}>
              <Card className="group h-full p-5 transition hover:-translate-y-1 hover:shadow-lg">
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

        <section className="grid gap-4 md:grid-cols-2">
          <Link href="/publishing/feeds">
            <Card className="flex items-center gap-4 p-5 transition hover:shadow-md">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
                <Rss className="h-5 w-5" />
              </span>
              <div>
                <h2 className="font-bold text-slate-900">مدیریت منابع</h2>
                <p className="mt-1 text-sm text-slate-500">
                  منابع RSS، سایت، وبلاگ، تلگرام و X را مدیریت کنید.
                </p>
              </div>
              <ArrowLeft className="mr-auto h-5 w-5 text-slate-400" />
            </Card>
          </Link>
          <Link href="/publishing/settings">
            <Card className="flex items-center gap-4 p-5 transition hover:shadow-md">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100 text-slate-700">
                <Settings2 className="h-5 w-5" />
              </span>
              <div>
                <h2 className="font-bold text-slate-900">تنظیمات نشر</h2>
                <p className="mt-1 text-sm text-slate-500">
                  اتصال GapGPT و WordPress را پیکربندی کنید.
                </p>
              </div>
              <ArrowLeft className="mr-auto h-5 w-5 text-slate-400" />
            </Card>
          </Link>
        </section>
      </main>
    </ProtectedLayout>
  );
}
