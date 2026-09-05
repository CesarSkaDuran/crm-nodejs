import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuditoriaService } from './auditoria.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';

@ApiBearerAuth()
@ApiTags('Auditoría')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('auditoria')
export class AuditoriaController {
  constructor(private readonly auditoriaService: AuditoriaService) {}

  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @Get()
  findAll(@Query() query: any, @CurrentUser() usuario: any) {
    return this.auditoriaService.findAll(usuario.empresa_id, query);
  }

  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @Get('registro/:tabla/:registroId')
  findByRegistro(
    @Param('tabla') tabla: string,
    @Param('registroId', ParseIntPipe) registroId: number,
    @CurrentUser() usuario: any,
  ) {
    return this.auditoriaService.obtenerCambios(
      usuario.empresa_id,
      tabla,
      registroId,
    );
  }

  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @Get('anulaciones')
  reporteAnulaciones(
    @Query('fecha_inicio') fechaInicio?: string,
    @Query('fecha_fin') fechaFin?: string,
    @CurrentUser() usuario?: any,
  ) {
    return this.auditoriaService.reporteAnulaciones(
      usuario.empresa_id,
      fechaInicio,
      fechaFin,
    );
  }

  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @Get('actividad')
  reporteActividad(
    @Query('usuario') usuario?: string,
    @Query('fecha_inicio') fechaInicio?: string,
    @Query('fecha_fin') fechaFin?: string,
    @CurrentUser() usuarioActual?: any,
  ) {
    return this.auditoriaService.reporteActividad(
      usuarioActual.empresa_id,
      usuario,
      fechaInicio,
      fechaFin,
    );
  }
}
