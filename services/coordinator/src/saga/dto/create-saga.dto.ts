import { IsInt, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';

export class CreateSagaDto {
  @IsString()
  orderId: string;

  @IsString()
  sku: string;

  @IsInt()
  @IsPositive()
  qty: number;

  @IsNumber()
  amount: number;

  @IsOptional()
  @IsString()
  failAt?: string | null;

  @IsOptional()
  @IsString()
  compFailAt?: string | null;
}
