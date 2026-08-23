import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { KardexController } from './kardex.controller';
import { KardexService } from './kardex.service';
import { Kardex } from './entities/kardex.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Kardex])],
  controllers: [KardexController],
  providers: [KardexService],
})
export class KardexModule {}
