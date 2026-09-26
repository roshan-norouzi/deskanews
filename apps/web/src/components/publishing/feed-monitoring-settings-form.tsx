import { formatPersianDigits } from '@deska/shared';
import { Input } from '@/components/ui/input';

export type FeedMonitoringSettingsMode = 'default' | 'custom';

export interface FeedMonitoringSettingsValues {
  settingsMode: FeedMonitoringSettingsMode;
  includeWords: string;
  excludeWords: string;
  pollIntervalMinutes: string;
  autoPoll: boolean;
  autoPrepare: boolean;
  autoPublish: boolean;
  autoSendSocial: boolean;
}

type AutomationField = 'autoPoll' | 'autoPrepare' | 'autoPublish' | 'autoSendSocial';

const AUTOMATION_FIELDS: Array<[AutomationField, string, string]> = [
  ['autoPoll', 'پایش خودکار', 'مطالب جدید این منبع بدون دخالت کاربر دریافت شوند.'],
  ['autoPrepare', 'آماده‌سازی خودکار', 'مطالب جدید بدون دخالت کاربر آماده شوند.'],
  ['autoPublish', 'انتشار خودکار', 'خبر آماده در سایت منتشر شود.'],
  ['autoSendSocial', 'ارسال خودکار به استودیوی اجتماعی', 'خبر آماده برای شبکه‌های اجتماعی ارسال شود.'],
];

interface FeedMonitoringSettingsFormProps {
  values: FeedMonitoringSettingsValues;
  orgPollMinutes: number | string;
  onChange: (patch: Partial<FeedMonitoringSettingsValues>) => void;
  settingsModeName?: string;
  showWordFiltersInDefaultMode?: boolean;
}

export function validateFeedMonitoringSettings(values: FeedMonitoringSettingsValues): string | null {
  if (values.settingsMode !== 'custom') return null;
  const interval = Number(values.pollIntervalMinutes);
  if (!Number.isInteger(interval) || interval < 5 || interval > 1440) {
    return 'فاصله پایش باید بین ۵ تا ۱۴۴۰ دقیقه باشد.';
  }
  return null;
}

export function buildPlatformFeedSettingsPatch(values: FeedMonitoringSettingsValues) {
  const validationError = validateFeedMonitoringSettings(values);
  if (validationError) return { error: validationError as string, body: null };
  const interval = Number(values.pollIntervalMinutes);
  return {
    error: null,
    body: {
      settingsMode: values.settingsMode,
      includeWords: values.settingsMode === 'custom' ? values.includeWords : [],
      excludeWords: values.settingsMode === 'custom' ? values.excludeWords : [],
      pollIntervalMinutes: values.settingsMode === 'custom' ? interval : null,
      autoPoll: values.autoPoll,
      autoPrepare: values.autoPrepare,
      autoPublish: values.autoPublish,
      autoSendSocial: values.autoSendSocial,
    },
  };
}

export function buildNewsFeedSettingsPatch(values: FeedMonitoringSettingsValues) {
  const validationError = validateFeedMonitoringSettings(values);
  if (validationError) return { error: validationError as string, body: null };
  const interval = Number(values.pollIntervalMinutes);
  if (values.settingsMode === 'default') {
    return {
      error: null,
      body: {
        settingsMode: 'default' as const,
        includeWords: '',
        excludeWords: '',
      },
    };
  }
  return {
    error: null,
    body: {
      settingsMode: 'custom' as const,
      includeWords: values.includeWords,
      excludeWords: values.excludeWords,
      pollIntervalMinutes: interval,
      autoPoll: values.autoPoll,
      autoPrepare: values.autoPrepare,
      autoPublish: values.autoPublish,
      autoSendSocial: values.autoSendSocial,
    },
  };
}

export function FeedMonitoringSettingsForm({
  values,
  orgPollMinutes,
  onChange,
  settingsModeName = 'settingsMode',
  showWordFiltersInDefaultMode = false,
}: FeedMonitoringSettingsFormProps) {
  const showWords = values.settingsMode === 'custom' || showWordFiltersInDefaultMode;

  return (
    <div className="space-y-4">
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-slate-700">نوع تنظیمات</legend>
        <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 p-4">
          <input
            type="radio"
            name={settingsModeName}
            checked={values.settingsMode === 'default'}
            onChange={() => onChange({ settingsMode: 'default', pollIntervalMinutes: String(orgPollMinutes) })}
            className="mt-1"
          />
          <span>
            <span className="block text-sm font-semibold text-slate-900">پیش‌فرض میز خبر</span>
            <span className="mt-1 block text-xs text-slate-500">
              فاصله پایش {formatPersianDigits(orgPollMinutes)} دقیقه؛ فیلتر کلمه از پیش‌فرض سازمان
            </span>
          </span>
        </label>
        <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 p-4">
          <input
            type="radio"
            name={settingsModeName}
            checked={values.settingsMode === 'custom'}
            onChange={() => onChange({ settingsMode: 'custom' })}
            className="mt-1"
          />
          <span>
            <span className="block text-sm font-semibold text-slate-900">اختصاصی این میز خبر</span>
            <span className="mt-1 block text-xs text-slate-500">فیلتر کلمات و فاصله پایش مخصوص منبع</span>
          </span>
        </label>
      </fieldset>
      {showWords ? (
        <>
          <Input
            label="کلمات اجباری (با ویرگول)"
            placeholder="فقط خبرهایی که حداقل یکی از این کلمات را دارند"
            value={values.includeWords}
            onChange={(event) => onChange({ includeWords: event.target.value })}
            disabled={values.settingsMode === 'default' && !showWordFiltersInDefaultMode}
          />
          <Input
            label="کلمات ممنوع (با ویرگول)"
            placeholder="خبرهایی که این کلمات را دارند نادیده گرفته می‌شوند"
            value={values.excludeWords}
            onChange={(event) => onChange({ excludeWords: event.target.value })}
            disabled={values.settingsMode === 'default' && !showWordFiltersInDefaultMode}
          />
        </>
      ) : null}
      {values.settingsMode === 'custom' ? (
        <label className="grid gap-1.5 text-sm font-medium text-slate-700">
          فاصله پایش (دقیقه)
          <input
            type="number"
            min="5"
            max="1440"
            required
            dir="ltr"
            className="rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
            value={values.pollIntervalMinutes}
            onChange={(event) => onChange({ pollIntervalMinutes: event.target.value })}
          />
        </label>
      ) : null}
      {AUTOMATION_FIELDS.map(([field, label, description]) => (
        <label key={field} className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 p-4 hover:border-primary-300">
          <input
            type="checkbox"
            checked={values[field]}
            onChange={(event) => onChange({ [field]: event.target.checked })}
            className="mt-1 h-4 w-4 rounded border-slate-300 text-primary-600"
          />
          <span>
            <span className="block text-sm font-semibold text-slate-900">{label}</span>
            <span className="mt-1 block text-xs font-normal leading-5 text-slate-500">{description}</span>
          </span>
        </label>
      ))}
    </div>
  );
}
