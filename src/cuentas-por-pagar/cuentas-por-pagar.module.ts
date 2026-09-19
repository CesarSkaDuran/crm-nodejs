import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CuentasPorPagarController } from './cuentas-por-pagar.controller';
import { CuentasPorPagarService } from './cuentas-por-pagar.service';
import { Third } from '../thirds/entities/third.entity';
import { AccountingEntryLine, AccountingEntry } from '../accounting/entities/accounting-entry.entity';
import { Account } from '../accounts/entities/account.entity';
import { Banco } from '../bancos/entities/banco.entity';
import { Company } from '../companies/entities/company.entity';
import { Credito } from '../cartera/entities/credito.entity';
import { CuotaCredito } from '../cartera/entities/cuota-credito.entity';
import { TrmModule } from '../trm/trm.module';

@Module({
  imports: [
    TrmModule,
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
  controllers: [CuentasPorPagarController],
  providers: [CuentasPorPagarService],
  exports: [CuentasPorPagarService],
})
export class CuentasPorPagarModule {}
