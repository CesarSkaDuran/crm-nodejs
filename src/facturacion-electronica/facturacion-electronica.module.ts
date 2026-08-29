import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FacturacionElectronicaController } from './facturacion-electronica.controller';
import { FacturacionElectronicaService } from './facturacion-electronica.service';
import { FacturacionElectronica } from './entities/facturacion-electronica.entity';
import { Sale } from '../sales/entities/sale.entity';
import { SaleDetail } from '../sales/entities/sale-detail.entity';
import { Third } from '../thirds/entities/third.entity';
import { Company } from '../companies/entities/company.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      FacturacionElectronica,
      Sale,
      SaleDetail,
      Third,
      Company,
    ]),
  ],
  controllers: [FacturacionElectronicaController],
  providers: [FacturacionElectronicaService],
  exports: [FacturacionElectronicaService],
})
export class FacturacionElectronicaModule {}
