import {
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
} from 'class-validator';
import { isTelegramChannelRef, isValidHttpFeedUrl } from '../source-adapters/feed-url.utils';

type FeedSourceType = 'rss' | 'website' | 'telegram' | 'sitemap';

function normalizeSourceType(value: unknown): FeedSourceType {
  if (value === 'website' || value === 'telegram' || value === 'sitemap') return value;
  return 'rss';
}

function sourceTypeFromArgs(args: ValidationArguments): FeedSourceType | undefined {
  const object = args.object as { sourceType?: unknown };
  return object.sourceType == null ? undefined : normalizeSourceType(object.sourceType);
}

function isValidFeedSourceUrl(value: unknown, sourceType?: FeedSourceType): boolean {
  if (typeof value !== 'string' || !value.trim()) return false;
  const trimmed = value.trim();
  const type = sourceType ? normalizeSourceType(sourceType) : undefined;
  if (type === 'telegram') return isTelegramChannelRef(trimmed);
  if (type) return isValidHttpFeedUrl(trimmed);
  return isTelegramChannelRef(trimmed) || isValidHttpFeedUrl(trimmed);
}

export function IsFeedSourceUrl(validationOptions?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isFeedSourceUrl',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown, args: ValidationArguments) {
          return isValidFeedSourceUrl(value, sourceTypeFromArgs(args));
        },
        defaultMessage(args: ValidationArguments) {
          const sourceType = sourceTypeFromArgs(args);
          if (sourceType === 'telegram') {
            return 'آدرس کانال تلگرام معتبر نیست؛ مانند @channel یا https://t.me/channel';
          }
          return 'آدرس منبع باید http یا https معتبر باشد';
        },
      },
    });
  };
}
