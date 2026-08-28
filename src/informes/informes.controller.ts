import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { InformesService } from './informes.service';
import {
  LibroMayorDto,
  LibroRangoDto,
  LibroTercerosDto,
  BalanceGeneralDto,
  PygDto,
} from './dto';

@ApiBearerAuth()
@ApiTags('Informes')
@UseGuards(JwtAuthGuard)
@Controller('informes')
export class InformesController {
  constructor(private readonly informesService: InformesService) {}

  @Get('libro')
  libro(
    @Query() query: LibroMayorDto,
    @CurrentUser() usuario: any,
  ) {
    return this.informesService.libroMayor(query, usuario.empresa_id);
  }

  @Get('rango')
  rango(
    @Query() query: LibroRangoDto,
    @CurrentUser() usuario: any,
  ) {
    return this.informesService.libroRango(query, usuario.empresa_id);
  }

  @Get('terceros')
  terceros(
    @Query() query: LibroTercerosDto,
    @CurrentUser() usuario: any,
  ) {
    return this.informesService.libroTerceros(query, usuario.empresa_id);
  }

  @Get('balance')
  balance(
    @Query() query: BalanceGeneralDto,
    @CurrentUser() usuario: any,
  ) {
    return this.informesService.balanceGeneral(query, usuario.empresa_id);
  }

  @Get('pyg')
  @ApiOkResponse({ description: 'Estado de Resultados (P&G) con KPIs y detalle de cuentas auxiliares' })
  pyg(
    @Query() query: PygDto,
    @CurrentUser() usuario: any,
  ) {
    return this.informesService.pyg(query, usuario.empresa_id);
  }
}
