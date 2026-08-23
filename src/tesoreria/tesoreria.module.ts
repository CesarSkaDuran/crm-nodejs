import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TesoreriaController } from './tesoreria.controller';
import { TesoreriaService } from './tesoreria.service';
import { Tesoreria } from './entities/tesoreria.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Tesoreria])],
  controllers: [TesoreriaController],
  providers: [TesoreriaService],
  exports: [TesoreriaService],
})
export class TesoreriaModule {}
