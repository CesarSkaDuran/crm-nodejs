import { Module } from '@nestjs/common';
import { InformesModule } from '../informes/informes.module';
import { ContaAsistController } from './contaasist.controller';
import { ContaAsistService } from './contaasist.service';

@Module({
  imports: [InformesModule],
  controllers: [ContaAsistController],
  providers: [ContaAsistService],
})
export class ContaAsistModule {}
