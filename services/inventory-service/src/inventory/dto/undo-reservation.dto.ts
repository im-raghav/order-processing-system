import { IsIn, IsString } from 'class-validator';
import { StepName, UndoRequestDto } from '@order-system/shared-types';

export class UndoReservationDto implements UndoRequestDto {
  @IsString()
  orderId: string;

  @IsIn([StepName.RESERVE_INVENTORY])
  stepName: StepName;
}
