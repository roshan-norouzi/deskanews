import { IsString, MaxLength } from 'class-validator';

export class CreateWalletPaymentDto {
  @IsString()
  @MaxLength(64)
  packageId!: string;
}
