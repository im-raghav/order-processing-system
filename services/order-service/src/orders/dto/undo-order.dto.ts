import { IsIn, IsString } from 'class-validator';
import { StepName, UndoRequestDto } from '@order-system/shared-types';

export class UndoOrderDto implements UndoRequestDto {
  @IsString()
  orderId: string;

  @IsIn([StepName.CREATE_ORDER])
  stepName: StepName;
}
