import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { InformesService } from './informes.service';

@ApiBearerAuth()
@ApiTags('Informes')
@UseGuards(JwtAuthGuard)
@Controller('informes')
export class InformesController {
  constructor(private readonly informesService: InformesService) {}

  @Get('libro')
  libro(
    @Query() query: any,
    @CurrentUser() usuario: any,
  ) {
    return this.informesService.libroMayor(query, usuario.empresa_id);
  }

  @Get('rango')
  rango(
    @Query() query: any,
    @CurrentUser() usuario: any,
  ) {
    return this.informesService.libroRango(query, usuario.empresa_id);
  }

  @Get('terceros')
  terceros(
    @Query() query: any,
    @CurrentUser() usuario: any,
  ) {
    return this.informesService.libroTerceros(query, usuario.empresa_id);
  }

  @Get('balance')
  balance(
    @Query() query: any,
    @CurrentUser() usuario: any,
  ) {
    return this.informesService.balanceGeneral(query, usuario.empresa_id);
  }

  @Get('pyg')
  pyg(
    @Query() query: any,
    @CurrentUser() usuario: any,
  ) {
    return this.informesService.pyg(query, usuario.empresa_id);
  }
}
