import { IsIn, IsInt, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';
import { DoRequestDto, StepName } from '@order-system/shared-types';

export class DoOrderDto implements DoRequestDto {
  @IsString()
  orderId: string;

  @IsIn([StepName.CREATE_ORDER])
  stepName: StepName;

  @IsString()
  sku: string;

  @IsInt()
  @IsPositive()
  qty: number;

  @IsNumber()
  amount: number;

  @IsOptional()
  failAt: string | null;

  @IsOptional()
  compFailAt: string | null;
}
