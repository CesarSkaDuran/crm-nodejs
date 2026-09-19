import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CierresService } from './cierres.service';
import { CreateCierreDto } from './dto/create-cierre.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { UserRole } from '../users/entities/user.entity';
import { Roles } from '../common/decorators/roles.decorator';

@ApiBearerAuth()
@ApiTags('Cierres')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('cierres')
export class CierresController {
  constructor(private readonly cierresService: CierresService) {}

  @Get()
  findAll(@Query() query: any, @CurrentUser() usuario: any) {
    return this.cierresService.findAll(usuario.empresa_id, query);
  }

  @Get('validar/:periodo')
  validar(
    @Param('periodo') periodo: string,
    @CurrentUser() usuario: any,
  ) {
    return this.cierresService.validarCierre(usuario.empresa_id, periodo);
  }

  @Get('estado/:periodo')
  estado(
    @Param('periodo') periodo: string,
    @CurrentUser() usuario: any,
  ) {
    return this.cierresService.obtenerEstadoCierre(usuario.empresa_id, periodo);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() usuario: any,
  ) {
    return this.cierresService.findOne(id, usuario.empresa_id);
  }

  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @Post()
  crear(
    @Body() dto: CreateCierreDto,
    @CurrentUser() usuario: any,
  ) {
    return this.cierresService.crear(dto, usuario.empresa_id, usuario.nombre);
  }

  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @Post(':id/cerrar')
  cerrar(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() usuario: any,
  ) {
    return this.cierresService.cerrar(id, usuario.empresa_id, usuario.nombre);
  }

  @Roles(UserRole.ADMIN)
  @Post(':id/anular')
  anular(
    @Param('id', ParseIntPipe) id: number,
    @Body('motivo') motivo: string,
    @CurrentUser() usuario: any,
  ) {
    return this.cierresService.anular(
      id,
      usuario.empresa_id,
      usuario.nombre,
      motivo,
    );
  }

  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @Post(':id/asiento-cierre')
  asientoCierre(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() usuario: any,
  ) {
    return this.cierresService.generarAsientoCierre(
      id,
      usuario.empresa_id,
      usuario.nombre,
    );
  }

  @Roles(UserRole.ADMIN)
  @Post(':id/reabrir')
  reabrir(
    @Param('id', ParseIntPipe) id: number,
    @Body('motivo') motivo: string,
    @CurrentUser() usuario: any,
  ) {
    return this.cierresService.reabrir(
      id,
      usuario.empresa_id,
      usuario.nombre,
      motivo,
    );
  }
}
