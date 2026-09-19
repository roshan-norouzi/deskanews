import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class RefreshDto {
  @IsOptional()
  @IsString({ message: 'توکن بازنشانی باید متن باشد' })
  @IsNotEmpty({ message: 'توکن بازنشانی الزامی است' })
  refreshToken?: string;
}
