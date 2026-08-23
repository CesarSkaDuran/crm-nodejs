import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { KardexService } from './kardex.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiBearerAuth()
@ApiTags('Kardex')
@UseGuards(JwtAuthGuard)
@Controller('kardex')
export class KardexController {
  constructor(private readonly kardexService: KardexService) {}

  @Get()
  findAll(
    @Query() query: any,
    @CurrentUser() usuario: any,
  ) {
    return this.kardexService.findAll(query, usuario.empresa_id);
  }

  @Get('producto/:productoId')
  findByProducto(
    @Param('productoId', ParseIntPipe) productoId: number,
    @Query() query: any,
    @CurrentUser() usuario: any,
  ) {
    return this.kardexService.findByProducto(productoId, usuario.empresa_id, query);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() usuario: any,
  ) {
    return this.kardexService.findOne(id, usuario.empresa_id);
  }
}
