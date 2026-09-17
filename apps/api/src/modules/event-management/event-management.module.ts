import { Module } from '@nestjs/common';
import { EventManagementController } from './event-management.controller';
import { EventManagementService } from './event-management.service';

@Module({ controllers: [EventManagementController], providers: [EventManagementService] })
export class EventManagementModule {}
