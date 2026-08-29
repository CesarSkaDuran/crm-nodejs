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
import { InventarioFisicoService } from './inventario-fisico.service';
import { CreateInventarioDto, ConsolidarInventarioDto, FinalizarInventarioDto } from './dto/inventario-fisico.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiBearerAuth()
@ApiTags('Inventario físico')
@UseGuards(JwtAuthGuard)
@Controller('inventario-fisico')
export class InventarioFisicoController {
  constructor(private readonly service: InventarioFisicoService) {}

  @Post()
  crear(
    @Body() dto: CreateInventarioDto,
    @CurrentUser() usuario: any,
  ) {
    return this.service.crear(dto, usuario.empresa_id, usuario.name);
  }

  @Get()
  findAll(@CurrentUser() usuario: any) {
    return this.service.findAll(usuario.empresa_id);
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

  @Post(':id/consolidar')
  consolidar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ConsolidarInventarioDto,
    @CurrentUser() usuario: any,
  ) {
    return this.service.consolidar(id, dto, usuario.empresa_id);
  }

  @Post(':id/finalizar')
  finalizar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: FinalizarInventarioDto,
    @CurrentUser() usuario: any,
  ) {
    return this.service.finalizar(id, dto, usuario.empresa_id, usuario.name);
  }

  @Post(':id/anular')
  anular(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() usuario: any,
  ) {
    return this.service.anular(id, usuario.empresa_id);
  }
}
