import type { SourceReaderService } from '../source-reader.service';
import type { FeedReadTarget } from './adapter-config';
import { maxItemsFromConfig } from './adapter-config';
import type { SourceAdapter } from './source-adapter.interface';

export class TelegramSourceAdapter implements SourceAdapter {
  readonly type = 'telegram' as const;

  constructor(private readonly reader: SourceReaderService) {}

  readEntries(target: FeedReadTarget) {
    const maxItems = maxItemsFromConfig(target.adapterConfig || {}, 50);
    return this.reader.readTelegramChannel(target.url, maxItems, target.telegramBridgeUrl);
  }
}
