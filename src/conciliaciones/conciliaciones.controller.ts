import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ConciliacionesService } from './conciliaciones.service';
import { CreateConciliacionDto } from './dto/create-conciliacion.dto';
import { UpdateConciliacionDto } from './dto/update-conciliacion.dto';
import { CreateMovimientoConciliacionDto } from './dto/create-movimiento.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { UserRole } from '../users/entities/user.entity';
import { Roles } from '../common/decorators/roles.decorator';

@ApiBearerAuth()
@ApiTags('Conciliaciones')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('conciliaciones')
export class ConciliacionesController {
  constructor(private readonly service: ConciliacionesService) {}

  @Get()
  findAll(@Query() query: any, @CurrentUser() usuario: any) {
    return this.service.findAll(query, usuario.empresa_id);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() usuario: any) {
    return this.service.findOne(id, usuario.empresa_id);
  }

  @Get(':id/resumen')
  getResumen(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() usuario: any,
  ) {
    return this.service.getResumen(id, usuario.empresa_id);
  }

  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @Post()
  create(
    @Body() dto: CreateConciliacionDto,
    @CurrentUser() usuario: any,
  ) {
    return this.service.create(
      dto,
      usuario.empresa_id,
      usuario.email || usuario.sub || 'sistema',
    );
  }

  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateConciliacionDto,
    @CurrentUser() usuario: any,
  ) {
    return this.service.update(id, usuario.empresa_id, dto);
  }

  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() usuario: any) {
    return this.service.remove(id, usuario.empresa_id);
  }

  // ============ Movimientos de conciliación ============

  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @Post(':id/movimientos')
  addMovimiento(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateMovimientoConciliacionDto,
    @CurrentUser() usuario: any,
  ) {
    return this.service.addMovimiento(id, dto, usuario.empresa_id);
  }

  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @Delete(':id/movimientos/:movId')
  removeMovimiento(
    @Param('id', ParseIntPipe) id: number,
    @Param('movId', ParseIntPipe) movId: number,
    @CurrentUser() usuario: any,
  ) {
    return this.service.removeMovimiento(movId, usuario.empresa_id);
  }

  // ============ Conciliar / Anular ============

  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @Post(':id/conciliar')
  conciliar(@Param('id', ParseIntPipe) id: number, @CurrentUser() usuario: any) {
    return this.service.conciliar(id, usuario.empresa_id);
  }

  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @Post(':id/anular')
  anular(@Param('id', ParseIntPipe) id: number, @CurrentUser() usuario: any) {
    return this.service.anular(id, usuario.empresa_id);
  }
}
