import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TesoreriaController } from './tesoreria.controller';
import { TesoreriaService } from './tesoreria.service';
import { Tesoreria } from './entities/tesoreria.entity';
import { Banco } from '../bancos/entities/banco.entity';
import { Account } from '../accounts/entities/account.entity';
import { Company } from '../companies/entities/company.entity';
import {
  AccountingEntry,
  AccountingEntryLine,
} from '../accounting/entities/accounting-entry.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Tesoreria,
      Banco,
      Account,
      Company,
      AccountingEntry,
      AccountingEntryLine,
    ]),
  ],
  controllers: [TesoreriaController],
  providers: [TesoreriaService],
  exports: [TesoreriaService],
})
export class TesoreriaModule {}
