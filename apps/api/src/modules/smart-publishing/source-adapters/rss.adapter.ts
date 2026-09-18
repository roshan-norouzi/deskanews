import type { SourceReaderService } from '../source-reader.service';
import type { FeedReadTarget } from './adapter-config';
import type { SourceAdapter } from './source-adapter.interface';

export class RssSourceAdapter implements SourceAdapter {
  readonly type = 'rss' as const;

  constructor(private readonly reader: SourceReaderService) {}

  readEntries(target: FeedReadTarget) {
    return this.reader.readFeed(target.url);
  }
}
