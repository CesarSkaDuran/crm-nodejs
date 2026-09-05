import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ValidacionesService } from './validaciones.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RolesGuard } from '../common/guards/roles.guard';

@ApiBearerAuth()
@ApiTags('Validaciones')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('validaciones')
export class ValidacionesController {
  constructor(private readonly validacionesService: ValidacionesService) {}

  @Post('limite-credito')
  validarLimiteCredito(
    @Body() body: { cliente_id: number; monto: number },
    @CurrentUser() usuario: any,
  ) {
    return this.validacionesService.validarLimiteCredito(
      usuario.empresa_id,
      body.cliente_id,
      body.monto,
    );
  }

  @Post('stock')
  validarStock(
    @Body() body: { producto_id: number; cantidad: number },
    @CurrentUser() usuario: any,
  ) {
    return this.validacionesService.validarStock(
      usuario.empresa_id,
      body.producto_id,
      body.cantidad,
    );
  }

  @Post('deuda-vencida-proveedor')
  validarDeudaVencidaProveedor(
    @Body() body: { proveedor_id: number },
    @CurrentUser() usuario: any,
  ) {
    return this.validacionesService.validarDeudaVencidaProveedor(
      usuario.empresa_id,
      body.proveedor_id,
    );
  }

  @Get('resumen-credito/:clienteId')
  obtenerResumenCredito(
    @Param('clienteId', ParseIntPipe) clienteId: number,
    @CurrentUser() usuario: any,
  ) {
    return this.validacionesService.obtenerResumenCredito(
      usuario.empresa_id,
      clienteId,
    );
  }

  @Post('precio-unitario')
  validarPrecioUnitario(@Body() body: { precio: number }) {
    return this.validacionesService.validarPrecioUnitario(body.precio);
  }

  @Post('descuento')
  validarDescuento(@Body() body: { descuento: number }) {
    return this.validacionesService.validarDescuento(body.descuento);
  }

  @Post('impuesto')
  validarImpuesto(@Body() body: { impuesto: number }) {
    return this.validacionesService.validarImpuesto(body.impuesto);
  }
}
