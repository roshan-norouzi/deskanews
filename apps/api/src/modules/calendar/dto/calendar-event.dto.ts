import { IsArray, IsBoolean, IsDateString, IsIn, IsNotEmpty, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import type { Prisma } from '@prisma/client';

const RECURRENCE_TYPES = ['none', 'daily', 'weekly', 'monthly', 'yearly'] as const;
const RECURRENCE_CALS = ['jalali', 'gregorian', 'lunar'] as const;

export class CalendarAttendeeDto {
  @IsOptional() @IsString() userId?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() @MaxLength(120) name?: string;
}

export class CreateCalendarEventDto {
  @IsString() @IsNotEmpty() @MaxLength(200) title!: string;
  @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @IsDateString({}, { message: 'تاریخ شروع رویداد معتبر نیست' }) startAt!: string;
  @IsDateString({}, { message: 'تاریخ پایان رویداد معتبر نیست' }) endAt!: string;
  @IsOptional() @IsBoolean() allDay?: boolean;
  @IsOptional() @IsString() @MaxLength(300) location?: string;
  @IsOptional() @IsIn(RECURRENCE_TYPES) recurrenceType?: string;
  @IsOptional() @IsObject() recurrenceRule?: Prisma.InputJsonValue;
  @IsOptional() @IsIn(RECURRENCE_CALS) recurrenceCal?: string;
  @IsOptional() @IsString() color?: string;
  @IsOptional() @IsString() entityType?: string;
  @IsOptional() @IsString() entityId?: string;
  @IsOptional() @IsArray() attendees?: CalendarAttendeeDto[];
}

export class UpdateCalendarEventDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(200) title?: string;
  @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @IsOptional() @IsDateString() startAt?: string;
  @IsOptional() @IsDateString() endAt?: string;
  @IsOptional() @IsBoolean() allDay?: boolean;
  @IsOptional() @IsString() @MaxLength(300) location?: string;
  @IsOptional() @IsIn(RECURRENCE_TYPES) recurrenceType?: string;
  @IsOptional() @IsObject() recurrenceRule?: Prisma.InputJsonValue;
  @IsOptional() @IsIn(RECURRENCE_CALS) recurrenceCal?: string;
  @IsOptional() @IsString() color?: string;
  @IsOptional() @IsString() entityType?: string;
  @IsOptional() @IsString() entityId?: string;
  @IsOptional() @IsArray() attendees?: CalendarAttendeeDto[];
}

export class CreateSystemObservanceDto extends CreateCalendarEventDto {
  @IsOptional() @IsBoolean() isHoliday?: boolean;
  @IsOptional() @IsString() @MaxLength(120) sourceKey?: string;
}

export class UpdateSystemObservanceDto extends UpdateCalendarEventDto {
  @IsOptional() @IsBoolean() isHoliday?: boolean;
  @IsOptional() @IsString() @MaxLength(120) sourceKey?: string;
}
