import { Module } from '@nestjs/common';
import { CalendarController } from './calendar.controller';
import { CalendarService } from './calendar.service';
import { SystemObservancesController } from './system-observances.controller';

@Module({
  controllers: [CalendarController, SystemObservancesController],
  providers: [CalendarService],
  exports: [CalendarService],
})
export class CalendarModule {}
