import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CuentasPorPagarController } from './cuentas-por-pagar.controller';
import { CuentasPorPagarService } from './cuentas-por-pagar.service';
import { Third } from '../thirds/entities/third.entity';
import { AccountingEntryLine } from '../accounting/entities/accounting-entry.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Third, AccountingEntryLine])],
  controllers: [CuentasPorPagarController],
  providers: [CuentasPorPagarService],
  exports: [CuentasPorPagarService],
})
export class CuentasPorPagarModule {}
