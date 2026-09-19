import { IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class CreateTenantDto {
  @IsString({ message: 'نام سازمان باید متن باشد' })
  @IsNotEmpty({ message: 'نام سازمان الزامی است' })
  @MaxLength(100, { message: 'نام سازمان نباید بیش از ۱۰۰ کاراکتر باشد' })
  name!: string;

  @IsString({ message: 'شناسه URL باید متن باشد' })
  @IsNotEmpty({ message: 'شناسه URL الزامی است' })
  @Matches(/^[a-z0-9-]+$/, { message: 'شناسه URL فقط می‌تواند شامل حروف کوچک، اعداد و خط تیره باشد' })
  slug!: string;

  @IsOptional()
  @IsString()
  locale?: string;
}
