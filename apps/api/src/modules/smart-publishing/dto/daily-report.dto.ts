import { IsString, Length, Matches } from 'class-validator';

export class CreateDailyReportDto {
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  reportDate!: string;
}

export class UpdateDailyReportDto {
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  reportDate!: string;
}

export class AddDailyReportItemDto {
  @IsString()
  @Length(10, 40)
  articleId!: string;
}
