import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TiposTerceroController } from './tipos-tercero.controller';
import { TiposTerceroService } from './tipos-tercero.service';
import { TipoTercero } from './entities/tipo-tercero.entity';

@Module({
  imports: [TypeOrmModule.forFeature([TipoTercero])],
  controllers: [TiposTerceroController],
  providers: [TiposTerceroService],
  exports: [TiposTerceroService],
})
export class TiposTerceroModule {}
