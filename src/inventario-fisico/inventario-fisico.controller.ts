import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { InventarioFisicoService } from './inventario-fisico.service';
import { CreateInventarioDto, ConsolidarInventarioDto, FinalizarInventarioDto } from './dto/inventario-fisico.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { UserRole } from '../users/entities/user.entity';
import { Roles } from '../common/decorators/roles.decorator';

@ApiBearerAuth()
@ApiTags('Inventario físico')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('inventario-fisico')
export class InventarioFisicoController {
  constructor(private readonly service: InventarioFisicoService) {}

  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @Post()
  crear(
    @Body() dto: CreateInventarioDto,
    @CurrentUser() usuario: any,
  ) {
    return this.service.crear(dto, usuario.empresa_id, usuario.nombre);
  }

  @Get()
  findAll(
    @CurrentUser() usuario: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('date') date?: string,
    @Query('date2') date2?: string,
  ) {
    return this.service.findAll(
      { page, limit, date, date2 },
      usuario.empresa_id,
    );
  }

  @Get('pendiente')
  findPendiente(@CurrentUser() usuario: any) {
    return this.service.findPendiente(usuario.empresa_id);
  }

  @Get('valorizacion')
  valorizacion(@CurrentUser() usuario: any) {
    return this.service.valorizacion(usuario.empresa_id);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() usuario: any,
  ) {
    return this.service.findOne(id, usuario.empresa_id);
  }

  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @Post(':id/consolidar')
  consolidar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ConsolidarInventarioDto,
    @CurrentUser() usuario: any,
  ) {
    return this.service.consolidar(id, dto, usuario.empresa_id);
  }

  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @Post(':id/conteos')
  guardarParcial(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ConsolidarInventarioDto,
    @CurrentUser() usuario: any,
  ) {
    return this.service.guardarParcial(id, dto, usuario.empresa_id);
  }

  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @Post(':id/finalizar')
  finalizar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: FinalizarInventarioDto,
    @CurrentUser() usuario: any,
  ) {
    return this.service.finalizar(id, dto, usuario.empresa_id, usuario.nombre);
  }

  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @Post(':id/anular')
  anular(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() usuario: any,
  ) {
    return this.service.anular(id, usuario.empresa_id);
  }
}