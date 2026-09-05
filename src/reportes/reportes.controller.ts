import {
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ReportesService } from './reportes.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';

@ApiBearerAuth()
@ApiTags('Reportes')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('reportes')
export class ReportesController {
  constructor(private readonly reportesService: ReportesService) {}

  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @Get('balance-prueba')
  balancePrueba(
    @Query('fecha_inicio') fechaInicio: string,
    @Query('fecha_fin') fechaFin: string,
    @CurrentUser() usuario: any,
  ) {
    return this.reportesService.balancePrueba(
      usuario.empresa_id,
      fechaInicio,
      fechaFin,
    );
  }

  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @Get('estado-resultados')
  estadoResultados(
    @Query('fecha_inicio') fechaInicio: string,
    @Query('fecha_fin') fechaFin: string,
    @CurrentUser() usuario: any,
  ) {
    return this.reportesService.estadoResultados(
      usuario.empresa_id,
      fechaInicio,
      fechaFin,
    );
  }

  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @Get('flujo-caja')
  flujoCaja(
    @Query('fecha_inicio') fechaInicio: string,
    @Query('fecha_fin') fechaFin: string,
    @CurrentUser() usuario: any,
  ) {
    return this.reportesService.flujoCaja(
      usuario.empresa_id,
      fechaInicio,
      fechaFin,
    );
  }

  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  @Get('analisis-cartera')
  analisisCartera(
    @Query('fecha_inicio') fechaInicio: string,
    @Query('fecha_fin') fechaFin: string,
    @CurrentUser() usuario: any,
  ) {
    return this.reportesService.analisisCartera(
      usuario.empresa_id,
      fechaInicio,
      fechaFin,
    );
  }
}
