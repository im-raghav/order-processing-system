import { IsIn, IsString } from 'class-validator';
import { StepName, UndoRequestDto } from '@order-system/shared-types';

export class UndoShipmentDto implements UndoRequestDto {
  @IsString()
  orderId: string;

  @IsIn([StepName.CREATE_SHIPMENT])
  stepName: StepName;
}
