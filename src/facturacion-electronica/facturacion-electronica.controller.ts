import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { FacturacionElectronicaService } from './facturacion-electronica.service';
import { ConfigurarFacturacionDto, EmitirFacturaDto } from './dto/facturacion-electronica.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiBearerAuth()
@ApiTags('Facturación electrónica')
@UseGuards(JwtAuthGuard)
@Controller('facturacion-electronica')
export class FacturacionElectronicaController {
  constructor(private readonly service: FacturacionElectronicaService) {}

  @Get()
  getConfig(@CurrentUser() usuario: any) {
    return this.service.getConfig(usuario.empresa_id);
  }

  @Get('estado')
  estado(@CurrentUser() usuario: any) {
    return this.service.estado(usuario.empresa_id);
  }

  @Post('configurar')
  configurar(
    @Body() dto: ConfigurarFacturacionDto,
    @CurrentUser() usuario: any,
  ) {
    return this.service.configurar(dto, usuario.empresa_id);
  }

  @Post('emitir')
  emitir(
    @Body() dto: EmitirFacturaDto,
    @CurrentUser() usuario: any,
  ) {
    return this.service.emitir(dto, usuario.empresa_id);
  }
}
