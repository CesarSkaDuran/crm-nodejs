import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountingController } from './accounting.controller';
import { MovementsController } from './movements.controller';
import { AccountingService } from './accounting.service';
import { AccountingEntry, AccountingEntryLine } from './entities/accounting-entry.entity';
import { Account } from '../accounts/entities/account.entity';

@Module({
  imports: [TypeOrmModule.forFeature([AccountingEntry, AccountingEntryLine, Account])],
  controllers: [AccountingController, MovementsController],
  providers: [AccountingService],
  exports: [AccountingService],
})
export class AccountingModule {}
