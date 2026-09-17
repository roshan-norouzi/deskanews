import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export const EVENT_MANAGEMENT_TYPES = ['event', 'press_conference', 'media_visit', 'exhibition', 'sponsorship'] as const;
const PROJECT_STATUSES = ['draft', 'planning', 'approved', 'executing', 'completed', 'cancelled'] as const;
const PROJECT_MODES = ['in_person', 'online', 'hybrid'] as const;
const TASK_STATUSES = ['todo', 'in_progress', 'blocked', 'done', 'cancelled'] as const;

export class CreateEventManagementProjectDto {
  @IsString() @MinLength(2) @MaxLength(200) title!: string;
  @IsIn(EVENT_MANAGEMENT_TYPES) type!: string;
  @IsString() @MinLength(3) @MaxLength(5000) objective!: string;
  @IsOptional() @IsIn(PROJECT_STATUSES) status?: string;
  @IsOptional() @IsString() @MaxLength(80) organizationProfile?: string;
  @IsOptional() @IsIn(PROJECT_MODES) mode?: string;
  @IsOptional() @IsDateString() startAt?: string;
  @IsOptional() @IsDateString() endAt?: string;
  @IsOptional() @IsString() @MaxLength(500) location?: string;
  @IsOptional() @IsString() @MaxLength(2000) targetAudience?: string;
  @IsOptional() @IsString() ownerId?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) approvedBudget?: number;
  @IsOptional() @IsObject() details?: Record<string, unknown>;
}

export class UpdateEventManagementProjectDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(200) title?: string;
  @IsOptional() @IsIn(EVENT_MANAGEMENT_TYPES) type?: string;
  @IsOptional() @IsString() @MinLength(3) @MaxLength(5000) objective?: string;
  @IsOptional() @IsIn(PROJECT_STATUSES) status?: string;
  @IsOptional() @IsString() @MaxLength(80) organizationProfile?: string;
  @IsOptional() @IsIn(PROJECT_MODES) mode?: string;
  @IsOptional() @IsDateString() startAt?: string;
  @IsOptional() @IsDateString() endAt?: string;
  @IsOptional() @IsString() @MaxLength(500) location?: string;
  @IsOptional() @IsString() @MaxLength(2000) targetAudience?: string;
  @IsOptional() @IsString() ownerId?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) approvedBudget?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) actualCost?: number;
  @IsOptional() @IsObject() details?: Record<string, unknown>;
}

export class DateAssessmentDto {
  @IsDateString() targetDate!: string;
  @IsIn(EVENT_MANAGEMENT_TYPES) type!: string;
  @IsOptional() @IsString() projectId?: string;
  @IsOptional() @IsString() @MaxLength(5000) objective?: string;
  @IsOptional() @IsBoolean() flexible?: boolean;
}

export class OpportunityAssessmentDto {
  @IsIn(EVENT_MANAGEMENT_TYPES) type!: string;
  @IsObject() scores!: Record<string, number>;
}

export class GenerateChecklistDto {
  @IsOptional() @IsBoolean() replace?: boolean;
}

export class CreateEventManagementTaskDto {
  @IsString() @MinLength(1) @MaxLength(120) phase!: string;
  @IsString() @MinLength(2) @MaxLength(500) title!: string;
  @IsOptional() @IsString() @MaxLength(1000) deliverable?: string;
  @IsOptional() @IsString() @MaxLength(200) ownerName?: string;
  @IsOptional() @IsDateString() dueAt?: string;
  @IsOptional() @IsIn(TASK_STATUSES) status?: string;
  @IsOptional() @IsBoolean() required?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100000) sortOrder?: number;
  @IsOptional() @IsString() @MaxLength(5000) notes?: string;
}

export class UpdateEventManagementTaskDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) phase?: string;
  @IsOptional() @IsString() @MinLength(2) @MaxLength(500) title?: string;
  @IsOptional() @IsString() @MaxLength(1000) deliverable?: string;
  @IsOptional() @IsString() @MaxLength(200) ownerName?: string;
  @IsOptional() @IsDateString() dueAt?: string;
  @IsOptional() @IsIn(TASK_STATUSES) status?: string;
  @IsOptional() @IsBoolean() required?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100000) sortOrder?: number;
  @IsOptional() @IsString() @MaxLength(5000) notes?: string;
}

export class CreateAgendaItemDto {
  @IsOptional() @IsDateString() startAt?: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(1440) durationMinutes!: number;
  @IsString() @MinLength(2) @MaxLength(500) title!: string;
  @IsOptional() @IsString() @MaxLength(200) ownerName?: string;
  @IsOptional() @IsString() @MaxLength(1000) onlineAction?: string;
  @IsOptional() @IsString() @MaxLength(1000) technicalNotes?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100000) sortOrder?: number;
}

export class CreateBudgetItemDto {
  @IsString() @MinLength(1) @MaxLength(120) category!: string;
  @IsString() @MinLength(2) @MaxLength(500) description!: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) quantity?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) unitCost?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) estimatedAmount?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) actualAmount?: number;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100000) sortOrder?: number;
}

export class UpdateBudgetItemDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) category?: string;
  @IsOptional() @IsString() @MinLength(2) @MaxLength(500) description?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) estimatedAmount?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) actualAmount?: number;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}
