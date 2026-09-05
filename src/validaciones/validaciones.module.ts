import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ValidacionesService } from './validaciones.service';
import { ValidacionesController } from './validaciones.controller';
import { Third } from '../thirds/entities/third.entity';
import { Credito } from '../cartera/entities/credito.entity';
import { Product } from '../products/entities/product.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Third, Credito, Product])],
  controllers: [ValidacionesController],
  providers: [ValidacionesService],
  exports: [ValidacionesService],
})
export class ValidacionesModule {}
