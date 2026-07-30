import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReservationEntity } from './entities/reservation.entity';
import { InventoryItemEntity } from './entities/inventory-item.entity';
import { InventoryController } from './inventory.controller';
import { ReservationsService } from './reservations.service';
import { InventorySeedService } from './inventory-seed.service';

@Module({
  imports: [TypeOrmModule.forFeature([ReservationEntity, InventoryItemEntity])],
  controllers: [InventoryController],
  providers: [ReservationsService, InventorySeedService],
})
export class InventoryModule {}
