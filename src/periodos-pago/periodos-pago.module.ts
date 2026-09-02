import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PeriodosPagoController } from './periodos-pago.controller';
import { PeriodosPagoService } from './periodos-pago.service';
import { PeriodoPago } from './entities/periodo-pago.entity';

@Module({
  imports: [TypeOrmModule.forFeature([PeriodoPago])],
  controllers: [PeriodosPagoController],
  providers: [PeriodosPagoService],
  exports: [PeriodosPagoService],
})
export class PeriodosPagoModule {}
