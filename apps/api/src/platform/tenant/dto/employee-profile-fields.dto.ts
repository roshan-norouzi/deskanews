import { IsDateString, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { MARITAL_STATUS } from '@deska/shared';

/** Shared employee identity / banking profile fields for tenant member APIs */
export class EmployeeProfileFieldsDto {
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'نام باید حداقل ۲ کاراکتر باشد' })
  @MaxLength(60)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'نام خانوادگی باید حداقل ۲ کاراکتر باشد' })
  @MaxLength(60)
  lastName?: string;

  @IsOptional()
  @IsString()
  @MinLength(10, { message: 'کد ملی باید ۱۰ رقم باشد' })
  @MaxLength(10)
  @Matches(/^[0-9۰-۹]{10}$/, { message: 'کد ملی باید فقط ۱۰ رقم باشد' })
  nationalId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  fatherName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  motherName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  birthCertificateNumber?: string;

  @IsOptional()
  @IsDateString({}, { message: 'تاریخ تولد شناسنامه معتبر نیست' })
  birthCertificateDate?: string;

  @IsOptional()
  @IsDateString({}, { message: 'تاریخ تولد واقعی معتبر نیست' })
  birthDate?: string;

  @IsOptional()
  @IsIn(Object.values(MARITAL_STATUS), { message: 'وضعیت تأهل معتبر نیست' })
  maritalStatus?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  @Matches(/^[0-9۰-۹]{10}$/, { message: 'کد پستی باید فقط ۱۰ رقم باشد' })
  postalCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(11)
  @Matches(/^[0۰][9۹][0-9۰-۹]{9}$/, { message: 'تلفن همراه معتبر نیست' })
  mobilePhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(11)
  @Matches(/^[0۰][0-9۰-۹]{10}$/, { message: 'تلفن ثابت معتبر نیست' })
  landlinePhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  @Matches(/^[0-9۰-۹]{6,20}$/, { message: 'شماره سپرده باید فقط عددی باشد' })
  bankAccountNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  @Matches(/^[0-9۰-۹]{16}$/, { message: 'شماره کارت باید ۱۶ رقم باشد' })
  bankCardNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(26)
  iban?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  bankName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  @Matches(/^[0-9۰-۹]{8,16}$/, { message: 'شماره بیمه باید ۸ تا ۱۶ رقم باشد' })
  insuranceNumber?: string;
}
