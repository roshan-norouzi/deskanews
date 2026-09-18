import { Global, Module } from '@nestjs/common';
import { UsageTrackingService } from './usage-tracking.service';

@Global()
@Module({
  providers: [UsageTrackingService],
  exports: [UsageTrackingService],
})
export class UsageTrackingModule {}
