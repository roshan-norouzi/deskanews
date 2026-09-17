import { IsNotEmpty, IsString } from 'class-validator';

export class AcceptInviteDto {
  @IsString({ message: 'توکن دعوت باید متن باشد' })
  @IsNotEmpty({ message: 'توکن دعوت الزامی است' })
  token!: string;
}
