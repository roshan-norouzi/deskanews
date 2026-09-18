import type { SourceReaderService } from '../source-reader.service';
import type { FeedReadTarget } from './adapter-config';
import type { SourceAdapter } from './source-adapter.interface';

export class WebsiteSourceAdapter implements SourceAdapter {
  readonly type = 'website' as const;

  constructor(private readonly reader: SourceReaderService) {}

  readEntries(target: FeedReadTarget) {
    return this.reader.readWebsiteSource(target.url);
  }
}
