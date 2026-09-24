'use client';

import { useEffect, useState } from 'react';
import { Plus, Tags, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/utils';

export function PlatformTopicLabelsPanel() {
  const [labels, setLabels] = useState<string[]>([]);
  const [original, setOriginal] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState<'save' | 'apply' | null>(null);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    void apiFetch<string[]>('/platform/feed-topic-labels', { skipTenant: true })
      .then((rows) => {
        const next = Array.isArray(rows) ? rows : [];
        setLabels(next);
        setOriginal(next);
      })
      .catch((reason) => setNotice({ type: 'error', text: reason instanceof Error ? reason.message : 'دریافت لیبل‌ها انجام نشد' }));
  }, []);

  function addLabel() {
    const name = draft.trim();
    if (!name || labels.includes(name)) return;
    setLabels((current) => [...current, name]);
    setDraft('');
  }

  async function save() {
    const renameFrom: string[] = [];
    const renameTo: string[] = [];
    original.forEach((previous, index) => {
      const next = labels[index];
      if (next && next !== previous) {
        renameFrom.push(previous);
        renameTo.push(next);
      }
    });
    setBusy('save');
    setNotice(null);
    try {
      const saved = await apiFetch<string[]>('/platform/feed-topic-labels', {
        method: 'PUT',
        skipTenant: true,
        body: { labels, renameFrom, renameTo },
      });
      const next = Array.isArray(saved) ? saved : labels;
      setLabels(next);
      setOriginal(next);
      setNotice({ type: 'success', text: 'لیبل‌ها ذخیره شد. منابعی که لیبل‌شان حذف شده، دوباره برچسب می‌خورند.' });
    } catch (reason) {
      setNotice({ type: 'error', text: reason instanceof Error ? reason.message : 'ذخیره لیبل‌ها انجام نشد' });
    } finally {
      setBusy(null);
    }
  }

  async function applyLabels() {
    setBusy('apply');
    setNotice(null);
    try {
      const result = await apiFetch<{ assigned: number; remaining: number }>('/platform/feed-topic-labels/apply', {
        method: 'POST',
        skipTenant: true,
      });
      const assigned = result?.assigned ?? 0;
      const remaining = result?.remaining ?? 0;
      setNotice({
        type: 'success',
        text: remaining > 0
          ? `${assigned} منبع برچسب خورد. ${remaining} منبع هنوز بدون لیبل است؛ دوباره بزنید.`
          : assigned > 0
            ? `${assigned} منبع برچسب خورد.`
            : 'منبع بدون لیبلِ قابل‌تشخیصی نماند.',
      });
    } catch (reason) {
      setNotice({ type: 'error', text: reason instanceof Error ? reason.message : 'برچسب‌گذاری انجام نشد' });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm leading-7 text-slate-600">
        این لیبل‌ها کنار دستهٔ کاتالوگ (رسانه داخلی، بین‌المللی و …) روی هر منبع نشان داده می‌شوند. منابع بدون لیبل، با قانون نام یا هوش مصنوعی برچسب می‌خورند.
      </p>
      <ul className="space-y-2">
        {labels.map((label, index) => (
          <li key={`${original[index] || 'new'}-${index}`} className="flex items-center gap-2">
            <input
              value={label}
              onChange={(event) => setLabels((current) => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item))}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-primary-500"
            />
            <Button type="button" variant="ghost" onClick={() => setLabels((current) => current.filter((_, itemIndex) => itemIndex !== index))} aria-label="حذف لیبل">
              <Trash2 className="h-4 w-4" />
            </Button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addLabel(); } }}
          placeholder="لیبل تازه"
          className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-primary-500"
        />
        <Button type="button" variant="secondary" onClick={addLabel}><Plus className="h-4 w-4" /> افزودن</Button>
      </div>
      {notice ? <div className={`rounded-xl border px-4 py-3 text-sm ${notice.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-700'}`}>{notice.text}</div> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => void save()} isLoading={busy === 'save'}>ذخیره لیبل‌ها</Button>
        <Button type="button" variant="secondary" onClick={() => void applyLabels()} isLoading={busy === 'apply'}>
          <Tags className="h-4 w-4" /> برچسب‌گذاری منابع بدون لیبل
        </Button>
      </div>
    </div>
  );
}
