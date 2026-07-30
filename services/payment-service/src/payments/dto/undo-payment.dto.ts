import { IsIn, IsString } from 'class-validator';
import { StepName, UndoRequestDto } from '@order-system/shared-types';

export class UndoPaymentDto implements UndoRequestDto {
  @IsString()
  orderId: string;

  @IsIn([StepName.CHARGE_PAYMENT])
  stepName: StepName;
}
