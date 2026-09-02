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
import { RolesGuard } from '../common/guards/roles.guard';
import { UserRole } from '../users/entities/user.entity';
import { Roles } from '../common/decorators/roles.decorator';

@ApiBearerAuth()
@ApiTags('Facturación electrónica')
@UseGuards(JwtAuthGuard, RolesGuard)
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

  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @Post('toggle')
  toggle(@CurrentUser() usuario: any) {
    return this.service.toggle(usuario.empresa_id);
  }

  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @Post('configurar')
  configurar(
    @Body() dto: ConfigurarFacturacionDto,
    @CurrentUser() usuario: any,
  ) {
    return this.service.configurar(dto, usuario.empresa_id);
  }

  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @Post('emitir')
  emitir(
    @Body() dto: EmitirFacturaDto,
    @CurrentUser() usuario: any,
  ) {
    return this.service.emitir(dto, usuario.empresa_id);
  }
}