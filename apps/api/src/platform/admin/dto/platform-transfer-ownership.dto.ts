import { IsNotEmpty, IsString } from 'class-validator';

export class PlatformTransferOwnershipDto {
  @IsString()
  @IsNotEmpty({ message: 'کاربر مقصد الزامی است' })
  targetUserId!: string;
}
