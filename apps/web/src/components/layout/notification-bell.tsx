'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Bell, CheckCheck } from 'lucide-react';
import { formatPersianDigits } from '@deska/shared';
import { useApi } from '@/hooks/use-api';
import { apiFetch } from '@/lib/utils';
import { formatJalaliDateTime } from '@/lib/date';

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  type: string;
  link?: string | null;
  isRead: boolean;
  createdAt: string;
}

interface NotificationSummary { unreadCount: number; items: NotificationItem[] }

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const { data, refetch, mutate } = useApi<NotificationSummary>('/notifications/summary');

  useEffect(() => {
    const timer = window.setInterval(() => void refetch(), 30_000);
    return () => window.clearInterval(timer);
  }, [refetch]);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const markRead = async (id: string) => {
    await apiFetch(`/notifications/${id}/read`, { method: 'PATCH' }).catch(() => undefined);
    if (data) mutate({ unreadCount: Math.max(0, data.unreadCount - (data.items.find((item) => item.id === id)?.isRead ? 0 : 1)), items: data.items.map((item) => item.id === id ? { ...item, isRead: true } : item) });
  };

  const markAll = async () => {
    await apiFetch('/notifications/read-all', { method: 'PATCH' });
    if (data) mutate({ unreadCount: 0, items: data.items.map((item) => ({ ...item, isRead: true })) });
  };

  const unread = data?.unreadCount ?? 0;
  return <div ref={containerRef} className="relative">
    <button type="button" className="relative grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50" onClick={() => setOpen((value) => !value)} aria-label="اعلان‌ها" aria-expanded={open}>
      <Bell className="h-4 w-4" />
      {unread > 0 && <span className="absolute -left-1 -top-1 min-w-4 rounded-full bg-red-600 px-1 text-center text-[10px] leading-4 text-white">{formatPersianDigits(Math.min(unread, 99))}</span>}
    </button>
    {open && <div className="absolute left-0 top-11 z-50 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3"><div><p className="font-semibold text-slate-900">اعلان‌ها</p><p className="mt-0.5 text-xs text-slate-500">{formatPersianDigits(unread)} خوانده‌نشده</p></div>{unread > 0 && <button type="button" onClick={() => void markAll()} className="flex items-center gap-1 text-xs text-primary-700"><CheckCheck className="h-4 w-4" /> خواندن همه</button>}</div>
      <div className="max-h-[28rem] overflow-y-auto">{data?.items.length ? data.items.map((item) => {
        const content = <><div className="flex items-start gap-3"><span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${item.isRead ? 'bg-slate-200' : item.type === 'error' ? 'bg-red-500' : item.type === 'success' ? 'bg-emerald-500' : 'bg-blue-500'}`} /><div className="min-w-0"><p className="text-sm font-medium text-slate-900">{item.title}</p><p className="mt-1 text-xs leading-5 text-slate-600">{item.message}</p><p className="mt-1 text-[11px] text-slate-400">{formatJalaliDateTime(item.createdAt)}</p></div></div></>;
        const classes = `block border-b border-slate-100 px-4 py-3 text-right transition hover:bg-slate-50 ${item.isRead ? '' : 'bg-blue-50/40'}`;
        return item.link ? <Link key={item.id} href={item.link} className={classes} onClick={() => { setOpen(false); void markRead(item.id); }}>{content}</Link> : <button key={item.id} type="button" className={`${classes} w-full`} onClick={() => void markRead(item.id)}>{content}</button>;
      }) : <p className="px-4 py-10 text-center text-sm text-slate-500">اعلانی وجود ندارد.</p>}</div>
    </div>}
  </div>;
}
