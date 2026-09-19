import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PartidasRecurrentesService } from './partidas-recurrentes.service';
import { PartidasRecurrentesController } from './partidas-recurrentes.controller';
import { PartidaRecurrente } from './entities/partida-recurrente.entity';

@Module({
  imports: [TypeOrmModule.forFeature([PartidaRecurrente])],
  controllers: [PartidasRecurrentesController],
  providers: [PartidasRecurrentesService],
  exports: [PartidasRecurrentesService],
})
export class PartidasRecurrentesModule {}
