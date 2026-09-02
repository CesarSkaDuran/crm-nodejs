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
import { ApiBearerAuth, ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { TipoComprobantesService } from './tipo-comprobantes.service';
import { CreateTipoComprobanteDto } from './dto/create-tipo-comprobante.dto';
import { UpdateTipoComprobanteDto } from './dto/update-tipo-comprobante.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { UserRole } from '../users/entities/user.entity';
import { Roles } from '../common/decorators/roles.decorator';

/**
 * Tipos de Comprobantes
 * =====================
 *
 * Gestiona los tipos de comprobantes contables de cada empresa.
 * Cada tipo define un nombre, prefijo y consecutivo automático.
 *
 * Tipos disponibles (campo `tipo`):
 *  1 = Factura de venta
 *  2 = Factura de compra
 *  3 = Comprobante de contabilidad
 *  4 = Comprobante de gasto
 *  5 = Ajuste de inventarios
 *  6 = Comprobante de depósito
 *  7 = Comprobante de retiro
 *
 * El consecutivo se incrementa automáticamente al llamar a
 * `POST /:id/siguiente`, garantizando numeración única.
 */
@ApiBearerAuth()
@ApiTags('Tipos de comprobantes')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('tipo-comprobantes')
export class TipoComprobantesController {
  constructor(private readonly service: TipoComprobantesService) {}

  /**
   * Lista los tipos de comprobantes con paginación.
   *
   * Query params:
   *  - page: número de página (default 1)
   *  - limit: elementos por página (default 20, max 100)
   *  - search: busca por nombre o simple
   *  - tipo: filtra por tipo de comprobante (1-7)
   *
   * Retorna: { data: TipoComprobante[], total, page, limit }
   */
  @Get()
  @ApiOperation({ summary: 'Listar tipos de comprobantes con paginación' })
  findAll(
    @Query() query: any,
    @CurrentUser() usuario: any,
  ) {
    return this.service.findAll(query, usuario.empresa_id);
  }

  /**
   * Obtiene un tipo de comprobante por ID.
   */
  @Get(':id')
  @ApiOperation({ summary: 'Obtener tipo de comprobante por ID' })
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() usuario: any,
  ) {
    return this.service.findOne(id, usuario.empresa_id);
  }

  /**
   * Crea un nuevo tipo de comprobante.
   * El campo `nombre` debe ser único por empresa.
   * El `consecutivo` se inicializa en 1 por defecto.
   */
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @Post()
  @ApiOperation({ summary: 'Crear tipo de comprobante' })
  create(
    @Body() dto: CreateTipoComprobanteDto,
    @CurrentUser() usuario: any,
  ) {
    return this.service.create(dto, usuario.empresa_id);
  }

  /**
   * Actualiza un tipo de comprobante existente.
   * Si se cambia el `consecutivo`, el próximo comprobante usará el nuevo valor.
   */
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar tipo de comprobante' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTipoComprobanteDto,
    @CurrentUser() usuario: any,
  ) {
    return this.service.update(id, usuario.empresa_id, dto);
  }

  /**
   * Elimina un tipo de comprobante.
   * No se puede eliminar si tiene comprobantes asociados.
   */
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar tipo de comprobante' })
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() usuario: any,
  ) {
    return this.service.remove(id, usuario.empresa_id);
  }

  /**
   * Obtiene el siguiente consecutivo disponible y lo incrementa.
   *
   * Retorna: { consecutivo: "FV0001" }
   * El formato es: prefijo (o simple) + número padded a 4 dígitos.
   *
   * Este endpoint es transaccional: garantiza que no haya duplicados
   * incluso con peticiones concurrentes.
   */
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @Post(':id/siguiente')
  @ApiOperation({ summary: 'Obtener siguiente consecutivo e incrementarlo' })
  @ApiResponse({ status: 201, description: 'Consecutivo generado', type: Object })
  nextConsecutivo(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() usuario: any,
  ) {
    return this.service.nextConsecutivo(id, usuario.empresa_id);
  }
}