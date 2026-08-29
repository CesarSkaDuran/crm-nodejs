import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InventarioFisicoController } from './inventario-fisico.controller';
import { InventarioFisicoService } from './inventario-fisico.service';
import { InventarioFisico } from './entities/inventario-fisico.entity';
import { DetalleInventarioFisico } from './entities/detalle-inventario-fisico.entity';
import { Product } from '../products/entities/product.entity';
import { Company } from '../companies/entities/company.entity';
import { Kardex } from '../kardex/entities/kardex.entity';
import { AccountingEntry, AccountingEntryLine } from '../accounting/entities/accounting-entry.entity';
import { Account } from '../accounts/entities/account.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      InventarioFisico,
      DetalleInventarioFisico,
      Product,
      Company,
      Kardex,
      AccountingEntry,
      AccountingEntryLine,
      Account,
    ]),
  ],
  controllers: [InventarioFisicoController],
  providers: [InventarioFisicoService],
  exports: [InventarioFisicoService],
})
export class InventarioFisicoModule {}
