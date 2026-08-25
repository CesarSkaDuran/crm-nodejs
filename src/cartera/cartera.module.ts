import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CarteraController } from './cartera.controller';
import { CarteraService } from './cartera.service';
import { Third } from '../thirds/entities/third.entity';
import { AccountingEntryLine } from '../accounting/entities/accounting-entry.entity';
import { Account } from '../accounts/entities/account.entity';
import { AccountingModule } from '../accounting/accounting.module';
import { TipoComprobantesModule } from '../tipo-comprobantes/tipo-comprobantes.module';
import { BancosModule } from '../bancos/bancos.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Third, AccountingEntryLine, Account]),
    AccountingModule,
    TipoComprobantesModule,
    BancosModule,
  ],
  controllers: [CarteraController],
  providers: [CarteraService],
  exports: [CarteraService],
})
export class CarteraModule {}
