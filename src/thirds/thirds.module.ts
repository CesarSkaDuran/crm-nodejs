import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThirdsService } from './thirds.service';
import { ThirdsController } from './thirds.controller';
import { Third } from './entities/third.entity';
import { Account } from '../accounts/entities/account.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Third, Account])],
  controllers: [ThirdsController],
  providers: [ThirdsService],
  exports: [ThirdsService],
})
export class ThirdsModule {}
