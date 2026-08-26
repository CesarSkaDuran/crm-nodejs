import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CuentasPorPagarController } from './cuentas-por-pagar.controller';
import { CuentasPorPagarService } from './cuentas-por-pagar.service';
import { Third } from '../thirds/entities/third.entity';
import { AccountingEntryLine, AccountingEntry } from '../accounting/entities/accounting-entry.entity';
import { Account } from '../accounts/entities/account.entity';
import { Banco } from '../bancos/entities/banco.entity';
import { Company } from '../companies/entities/company.entity';
import { AccountingModule } from '../accounting/accounting.module';
import { TipoComprobantesModule } from '../tipo-comprobantes/tipo-comprobantes.module';
import { BancosModule } from '../bancos/bancos.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Third,
      AccountingEntryLine,
      AccountingEntry,
      Account,
      Banco,
      Company,
    ]),
    AccountingModule,
    TipoComprobantesModule,
    BancosModule,
  ],
  controllers: [CuentasPorPagarController],
  providers: [CuentasPorPagarService],
  exports: [CuentasPorPagarService],
})
export class CuentasPorPagarModule {}
