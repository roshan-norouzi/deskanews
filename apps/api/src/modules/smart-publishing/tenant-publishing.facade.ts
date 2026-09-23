import { Injectable } from '@nestjs/common';
import { TenantPublishingPort } from '../../contracts/tenant-publishing.port';
import { PlatformFeedService } from './platform-feed.service';

@Injectable()
export class TenantPublishingFacade implements TenantPublishingPort {
  constructor(private readonly platformFeeds: PlatformFeedService) {}

  async ensureTenantSubscriptions(tenantId: string): Promise<void> {
    await this.platformFeeds.ensureSubscriptions(tenantId);
  }
}
