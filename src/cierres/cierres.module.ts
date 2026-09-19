import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CierresService } from './cierres.service';
import { CierresController } from './cierres.controller';
import { Cierre } from './entities/cierre.entity';
import { Kardex } from '../kardex/entities/kardex.entity';
import { Sale } from '../sales/entities/sale.entity';
import { Purchase } from '../purchases/entities/purchase.entity';
import { AccountingEntry, AccountingEntryLine } from '../accounting/entities/accounting-entry.entity';
import { Company } from '../companies/entities/company.entity';
import { Account } from '../accounts/entities/account.entity';
import { Auditoria } from '../auditoria/entities/auditoria.entity';
import { Product } from '../products/entities/product.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Cierre,
      Kardex,
      Sale,
      Purchase,
      Product,
      AccountingEntry,
      AccountingEntryLine,
      Company,
      Account,
      Auditoria,
    ]),
  ],
  controllers: [CierresController],
  providers: [CierresService],
  exports: [CierresService],
})
export class CierresModule {}
