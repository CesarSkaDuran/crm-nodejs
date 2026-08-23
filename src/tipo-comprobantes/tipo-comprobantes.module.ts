import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TipoComprobantesController } from './tipo-comprobantes.controller';
import { TipoComprobantesService } from './tipo-comprobantes.service';
import { TipoComprobante } from './entities/tipo-comprobante.entity';

@Module({
  imports: [TypeOrmModule.forFeature([TipoComprobante])],
  controllers: [TipoComprobantesController],
  providers: [TipoComprobantesService],
  exports: [TipoComprobantesService],
})
export class TipoComprobantesModule {}
