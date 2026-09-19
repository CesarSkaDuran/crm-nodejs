import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TrmService } from './trm.service';
import { TrmController } from './trm.controller';
import { Moneda } from '../monedas/entities/moneda.entity';
import { HistorialTasa } from './entities/historial-tasa.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Moneda, HistorialTasa])],
  controllers: [TrmController],
  providers: [TrmService],
  exports: [TrmService],
})
export class TrmModule {}
