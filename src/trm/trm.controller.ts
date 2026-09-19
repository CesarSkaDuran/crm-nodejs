import {
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { TrmService } from './trm.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';

@ApiBearerAuth()
@ApiTags('TRM')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('trm')
export class TrmController {
  constructor(private readonly trm: TrmService) {}

  /** TRM vigente registrada para la empresa (sin consultar la API externa). */
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  @Get('actual')
  actual(@CurrentUser() usuario: any) {
    return this.trm.trmActual(usuario.empresa_id);
  }

  /** Historial de tasas registradas. */
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @Get('historial')
  historial(@CurrentUser() usuario: any, @Query('limit') limit?: string) {
    return this.trm.historial(usuario.empresa_id, Number(limit) || 60);
  }

  /** Fuerza la sincronización con la fuente externa (datos.gov.co / fallback). */
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @Post('sincronizar')
  sincronizar() {
    return this.trm.sincronizar();
  }
}
