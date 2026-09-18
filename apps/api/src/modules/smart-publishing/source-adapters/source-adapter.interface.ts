import type { FeedEntry } from '../source-reader.service';
import type { FeedReadTarget } from './adapter-config';

export interface SourceAdapter {
  readonly type: FeedReadTarget['sourceType'];
  readEntries(target: FeedReadTarget): Promise<FeedEntry[]>;
}
