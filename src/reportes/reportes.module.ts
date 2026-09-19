import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReportesService } from './reportes.service';
import { ReportesController } from './reportes.controller';
import { AccountingEntryLine } from '../accounting/entities/accounting-entry.entity';
import { Account } from '../accounts/entities/account.entity';
import { CuotaCredito } from '../cartera/entities/cuota-credito.entity';
import { Banco } from '../bancos/entities/banco.entity';
import { PartidaRecurrente } from '../partidas-recurrentes/entities/partida-recurrente.entity';
import { Sale } from '../sales/entities/sale.entity';
import { Purchase } from '../purchases/entities/purchase.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AccountingEntryLine,
      Account,
      CuotaCredito,
      Banco,
      PartidaRecurrente,
      Sale,
      Purchase,
    ]),
  ],
  controllers: [ReportesController],
  providers: [ReportesService],
  exports: [ReportesService],
})
export class ReportesModule {}
