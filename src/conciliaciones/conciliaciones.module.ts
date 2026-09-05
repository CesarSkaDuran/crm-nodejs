import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConciliacionesController } from './conciliaciones.controller';
import { ConciliacionesService } from './conciliaciones.service';
import { ConciliacionBancaria } from './entities/conciliacion-bancaria.entity';
import { ConciliacionMovimiento } from './entities/conciliacion-movimiento.entity';
import { Banco } from '../bancos/entities/banco.entity';
import { Tesoreria } from '../tesoreria/entities/tesoreria.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ConciliacionBancaria,
      ConciliacionMovimiento,
      Banco,
      Tesoreria,
    ]),
  ],
  controllers: [ConciliacionesController],
  providers: [ConciliacionesService],
  exports: [ConciliacionesService],
})
export class ConciliacionesModule {}
