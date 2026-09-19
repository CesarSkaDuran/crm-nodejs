import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountsService } from './accounts.service';
import { AccountsController } from './accounts.controller';
import { Account } from './entities/account.entity';
import { AccountingEntryLine } from '../accounting/entities/accounting-entry.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Account, AccountingEntryLine])],
  controllers: [AccountsController],
  providers: [AccountsService],
  exports: [AccountsService],
})
export class AccountsModule {}
