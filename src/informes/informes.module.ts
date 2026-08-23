import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InformesController } from './informes.controller';
import { InformesService } from './informes.service';
import { AccountingEntryLine } from '../accounting/entities/accounting-entry.entity';
import { Account } from '../accounts/entities/account.entity';

@Module({
  imports: [TypeOrmModule.forFeature([AccountingEntryLine, Account])],
  controllers: [InformesController],
  providers: [InformesService],
})
export class InformesModule {}
