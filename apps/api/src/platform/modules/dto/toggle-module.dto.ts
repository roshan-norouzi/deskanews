import { IsBoolean, IsNotEmpty } from 'class-validator';

export class ToggleModuleDto {
  @IsBoolean({ message: 'وضعیت فعال‌سازی باید بولین باشد' })
  @IsNotEmpty({ message: 'وضعیت فعال‌سازی الزامی است' })
  enabled!: boolean;
}
