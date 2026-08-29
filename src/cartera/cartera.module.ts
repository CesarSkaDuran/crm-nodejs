import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CarteraController } from './cartera.controller';
import { CarteraService } from './cartera.service';
import { Third } from '../thirds/entities/third.entity';
import { AccountingEntryLine, AccountingEntry } from '../accounting/entities/accounting-entry.entity';
import { Account } from '../accounts/entities/account.entity';
import { Banco } from '../bancos/entities/banco.entity';
import { Company } from '../companies/entities/company.entity';
import { Credito } from './entities/credito.entity';
import { CuotaCredito } from './entities/cuota-credito.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Third,
      AccountingEntryLine,
      AccountingEntry,
      Account,
      Banco,
      Company,
      Credito,
      CuotaCredito,
    ]),
  ],
  controllers: [CarteraController],
  providers: [CarteraService],
  exports: [CarteraService],
})
export class CarteraModule {}
