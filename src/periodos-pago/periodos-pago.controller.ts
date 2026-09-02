import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { PeriodosPagoService } from './periodos-pago.service';
import { CreatePeriodoPagoDto, UpdatePeriodoPagoDto } from './dto/periodo-pago.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { UserRole } from '../users/entities/user.entity';
import { Roles } from '../common/decorators/roles.decorator';

/**
 * Maestro de Periodos de Pago para Créditos
 * ==========================================
 *
 * Permite configurar los periodos de pago disponibles para créditos
 * (cartera y cuentas por pagar). Cada periodo define un nombre y
 * el número de días entre cuotas.
 *
 * Si la empresa no tiene periodos configurados, se crean automáticamente
 * los periodos por defecto (Semanal, Quincenal, Mensual, Bimestral, Trimestral).
 */
@ApiBearerAuth()
@ApiTags('Periodos de pago')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('periodos-pago')
export class PeriodosPagoController {
  constructor(private readonly service: PeriodosPagoService) {}

  @Get()
  @ApiOperation({ summary: 'Listar periodos de pago de la empresa' })
  async findAll(@CurrentUser() usuario: any) {
    await this.service.asegurarPeriodosPorDefecto(usuario.empresa_id);
    return this.service.findAll(usuario.empresa_id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener periodo de pago por ID' })
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() usuario: any,
  ) {
    return this.service.findOne(id, usuario.empresa_id);
  }

  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @Post()
  @ApiOperation({ summary: 'Crear periodo de pago' })
  create(
    @Body() dto: CreatePeriodoPagoDto,
    @CurrentUser() usuario: any,
  ) {
    return this.service.create(dto, usuario.empresa_id);
  }

  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar periodo de pago' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePeriodoPagoDto,
    @CurrentUser() usuario: any,
  ) {
    return this.service.update(id, usuario.empresa_id, dto);
  }

  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar periodo de pago' })
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() usuario: any,
  ) {
    return this.service.remove(id, usuario.empresa_id);
  }
}