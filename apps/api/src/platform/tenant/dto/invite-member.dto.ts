import { IsDateString, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { EMPLOYEE_STATUS, ORGANIZATIONAL_ROLES } from '@deska/shared';

export class InviteMemberDto {
  @IsString()
  @MinLength(10, { message: 'شناسه کاربر معتبر نیست' })
  @MaxLength(64)
  userId!: string;

  @IsIn([...ORGANIZATIONAL_ROLES], { message: 'نقش عضویت معتبر نیست' })
  role!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  employeeCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  jobTitle?: string;

  @IsOptional()
  @IsIn(Object.values(EMPLOYEE_STATUS), { message: 'وضعیت همکاری معتبر نیست' })
  status?: string;

  @IsOptional()
  @IsDateString({}, { message: 'تاریخ استخدام معتبر نیست' })
  hireDate?: string;
}
