import { AdminAction, AnnouncementTone } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';

export const MAX_AI_LIMIT = 100_000;
export const MAX_ANNOUNCEMENT = 280;

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class OverviewQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2020)
  @Max(2100)
  year?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month?: number;
}

export class PageQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize = 20;
}

export const ORGANIZATION_STATUSES = ['all', 'active', 'suspended'] as const;
export const ORGANIZATION_SORTS = ['newest', 'oldest', 'name'] as const;

export class ListOrganizationsQueryDto extends PageQueryDto {
  /** Matches the business name or any member's email. */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsIn(ORGANIZATION_STATUSES)
  status: (typeof ORGANIZATION_STATUSES)[number] = 'all';

  @IsOptional()
  @IsIn(ORGANIZATION_SORTS)
  sort: (typeof ORGANIZATION_SORTS)[number] = 'newest';
}

export class AuditQueryDto extends PageQueryDto {
  @IsOptional()
  @IsUUID()
  organizationId?: string;

  @IsOptional()
  @IsEnum(AdminAction)
  action?: AdminAction;
}

export class SuspendOrganizationDto {
  /** Internal note for other admins; never shown to the business. */
  @Transform(trim)
  @IsString()
  @MinLength(3, { message: 'Give a short reason (at least 3 characters).' })
  @MaxLength(500)
  reason!: string;
}

export class UpdateAiLimitDto {
  @IsInt()
  @Min(0)
  @Max(MAX_AI_LIMIT)
  aiMonthlyLimit!: number;
}

export class UpdatePlatformConfigDto {
  @IsOptional()
  @IsBoolean()
  signupsEnabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_AI_LIMIT)
  defaultAiMonthlyLimit?: number;

  /** An empty string or null removes the announcement. */
  @IsOptional()
  @Transform(trim)
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(MAX_ANNOUNCEMENT)
  announcement?: string | null;

  @IsOptional()
  @IsEnum(AnnouncementTone)
  announcementTone?: AnnouncementTone;
}
