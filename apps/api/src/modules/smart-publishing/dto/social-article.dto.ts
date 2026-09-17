import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateSocialLeadDto {
  @IsString({ message: 'لید باید متن باشد' })
  @IsNotEmpty({ message: 'لید نمی‌تواند خالی باشد' })
  @MaxLength(1200, { message: 'لید حداکثر ۱۲۰۰ کاراکتر است' })
  leadText!: string;
}

export class UpdateSocialTitleDto {
  @IsString({ message: 'تیتر باید متن باشد' })
  @IsNotEmpty({ message: 'تیتر نمی‌تواند خالی باشد' })
  @MaxLength(500, { message: 'تیتر حداکثر ۵۰۰ کاراکتر است' })
  title!: string;
}

export class UpdateSocialCaptionDto {
  @IsString({ message: 'کپشن باید متن باشد' })
  @IsNotEmpty({ message: 'کپشن نمی‌تواند خالی باشد' })
  @MaxLength(20_000, { message: 'کپشن بیش از حد طولانی است' })
  rewrittenText!: string;
}

export class PublishSocialArticleDto {
  @IsOptional()
  @IsString({ message: 'کپشن باید متن باشد' })
  @MaxLength(20_000, { message: 'کپشن بیش از حد طولانی است' })
  caption!: string;

  @IsString({ message: 'تصویر تولیدشده معتبر نیست' })
  @IsNotEmpty({ message: 'تصویر تولیدشده الزامی است' })
  @MaxLength(20_000_000, { message: 'حجم تصویر بیش از حد مجاز است' })
  imageDataUrl!: string;
}
