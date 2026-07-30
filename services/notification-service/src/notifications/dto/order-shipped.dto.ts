import { IsISO8601, IsString } from 'class-validator';

export class OrderShippedDto {
  @IsString()
  orderId: string;

  @IsISO8601()
  shippedAt: string;
}
