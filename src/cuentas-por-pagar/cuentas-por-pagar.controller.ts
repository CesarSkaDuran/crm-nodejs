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
import { CreatePagoDto } from './dto/create-pago.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiBearerAuth()
@ApiTags('Cuentas por pagar')
@UseGuards(JwtAuthGuard)
@Controller('cuentas-por-pagar')
export class CuentasPorPagarController {
  constructor(private readonly service: CuentasPorPagarService) {}

  @Get()
  findAll(
    @Query() query: any,
    @CurrentUser() usuario: any,
  ) {
    return this.service.findAll(query, usuario.empresa_id);
  }

  @Get(':terceroId')
  findOne(
    @Param('terceroId', ParseIntPipe) terceroId: number,
    @CurrentUser() usuario: any,
  ) {
    return this.service.findOne(terceroId, usuario.empresa_id);
  }

  @Post('pago')
  pagar(
    @Body() dto: CreatePagoDto,
    @CurrentUser() usuario: any,
  ) {
    return this.service.pagar(dto, usuario.empresa_id, usuario.name);
  }
}
