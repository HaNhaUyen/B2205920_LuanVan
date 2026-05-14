import { IsEnum, IsOptional, IsString } from 'class-validator';

export class PaymentCallbackDto {
  @IsString()
  internalTransactionCode!: string;

  @IsOptional()
  @IsString()
  gatewayTransactionId?: string;

  @IsEnum(['paid', 'failed', 'expired'])
  paymentStatus!: 'paid' | 'failed' | 'expired';
}
