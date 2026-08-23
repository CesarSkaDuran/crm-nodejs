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
import { TipoComprobantesService } from './tipo-comprobantes.service';
import { CreateTipoComprobanteDto } from './dto/create-tipo-comprobante.dto';
import { UpdateTipoComprobanteDto } from './dto/update-tipo-comprobante.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiBearerAuth()
@ApiTags('Tipos de comprobantes')
@UseGuards(JwtAuthGuard)
@Controller('tipo-comprobantes')
export class TipoComprobantesController {
  constructor(private readonly service: TipoComprobantesService) {}

  @Get()
  findAll(
    @Query() query: any,
    @CurrentUser() usuario: any,
  ) {
    return this.service.findAll(query, usuario.empresa_id);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() usuario: any,
  ) {
    return this.service.findOne(id, usuario.empresa_id);
  }

  @Post()
  create(
    @Body() dto: CreateTipoComprobanteDto,
    @CurrentUser() usuario: any,
  ) {
    return this.service.create(dto, usuario.empresa_id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTipoComprobanteDto,
    @CurrentUser() usuario: any,
  ) {
    return this.service.update(id, usuario.empresa_id, dto);
  }

  @Delete(':id')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() usuario: any,
  ) {
    return this.service.remove(id, usuario.empresa_id);
  }

  @Post(':id/siguiente')
  nextConsecutivo(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() usuario: any,
  ) {
    return this.service.nextConsecutivo(id, usuario.empresa_id);
  }
}
