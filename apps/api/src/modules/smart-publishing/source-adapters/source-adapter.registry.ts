import { BadRequestException, Injectable } from '@nestjs/common';
import type { SourceType } from '../dto/feed.dto';
import type { FeedEntry } from '../source-reader.service';
import { SourceReaderService } from '../source-reader.service';
import type { FeedReadTarget } from './adapter-config';
import { RssSourceAdapter } from './rss.adapter';
import { SitemapSourceAdapter } from './sitemap.adapter';
import type { SourceAdapter } from './source-adapter.interface';
import { TelegramSourceAdapter } from './telegram.adapter';
import { WebsiteSourceAdapter } from './website.adapter';

@Injectable()
export class SourceAdapterRegistry {
  private readonly adapters: Map<SourceType, SourceAdapter>;

  constructor(private readonly reader: SourceReaderService) {
    const list: SourceAdapter[] = [
      new RssSourceAdapter(reader),
      new WebsiteSourceAdapter(reader),
      new TelegramSourceAdapter(reader),
      new SitemapSourceAdapter(reader),
    ];
    this.adapters = new Map(list.map((adapter) => [adapter.type, adapter]));
  }

  async readEntries(target: FeedReadTarget): Promise<FeedEntry[]> {
    const adapter = this.adapters.get(target.sourceType);
    if (!adapter) {
      throw new BadRequestException('نوع منبع پشتیبانی نمی‌شود');
    }
    return adapter.readEntries(target);
  }

  listTypes(): SourceType[] {
    return [...this.adapters.keys()];
  }
}
