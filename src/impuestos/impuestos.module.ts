import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ImpuestosController } from './impuestos.controller';
import { ImpuestosService } from './impuestos.service';
import { Impuesto } from './entities/impuesto.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Impuesto])],
  controllers: [ImpuestosController],
  providers: [ImpuestosService],
  exports: [ImpuestosService],
})
export class ImpuestosModule {}
