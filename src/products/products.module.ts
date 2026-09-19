import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { Product } from './entities/product.entity';
import { Account } from '../accounts/entities/account.entity';
import { Categoria } from '../categorias/entities/categoria.entity';
import { Kardex } from '../kardex/entities/kardex.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Product, Account, Categoria, Kardex])],
  controllers: [ProductsController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
