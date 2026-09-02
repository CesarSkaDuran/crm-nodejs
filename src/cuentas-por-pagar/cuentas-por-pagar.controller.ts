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
import { CuentasPorPagarService } from './cuentas-por-pagar.service';
import { CreateCreditoProveedorDto } from './dto/create-credito-proveedor.dto';
import { RegistrarPagoDto } from './dto/registrar-pago.dto';
import { PosfecharPagoDto } from './dto/posfechar-pago.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { UserRole } from '../users/entities/user.entity';
import { Roles } from '../common/decorators/roles.decorator';

@ApiBearerAuth()
@ApiTags('Cuentas por pagar')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('cuentas-por-pagar')
export class CuentasPorPagarController {
  constructor(private readonly service: CuentasPorPagarService) {}

  @Get()
  findAll(@Query() query: any, @CurrentUser() usuario: any) {
    return this.service.findAll(query, usuario.empresa_id);
  }

  @Get('cuotas-vencidas')
  cuotasVencidas(@Query() query: any, @CurrentUser() usuario: any) {
    return this.service.cuotasVencidas(usuario.empresa_id, query);
  }

  @Get('credito/:creditoId')
  findCredito(
    @Param('creditoId', ParseIntPipe) creditoId: number,
    @CurrentUser() usuario: any,
  ) {
    return this.service.findCredito(creditoId, usuario.empresa_id);
  }

  @Get(':terceroId')
  findOne(
    @Param('terceroId', ParseIntPipe) terceroId: number,
    @CurrentUser() usuario: any,
  ) {
    return this.service.findOne(terceroId, usuario.empresa_id);
  }

  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  @Post('credito')
  crearCredito(
    @Body() dto: CreateCreditoProveedorDto,
    @CurrentUser() usuario: any,
  ) {
    return this.service.crearCredito(dto, usuario.empresa_id, usuario.name);
  }

  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  @Post('pago')
  pagar(
    @Body() dto: RegistrarPagoDto,
    @CurrentUser() usuario: any,
  ) {
    return this.service.pagar(dto, usuario.empresa_id, usuario.name);
  }

  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  @Post('posfechar')
  posfechar(
    @Body() dto: PosfecharPagoDto,
    @CurrentUser() usuario: any,
  ) {
    return this.service.posfecharCuota(dto, usuario.empresa_id);
  }
}