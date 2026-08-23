import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CarteraController } from './cartera.controller';
import { CarteraService } from './cartera.service';
import { Third } from '../thirds/entities/third.entity';
import { AccountingEntryLine } from '../accounting/entities/accounting-entry.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Third, AccountingEntryLine])],
  controllers: [CarteraController],
  providers: [CarteraService],
  exports: [CarteraService],
})
export class CarteraModule {}
