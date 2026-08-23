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
import { SalesService } from './sales.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiBearerAuth()
@ApiTags('Ventas')
@UseGuards(JwtAuthGuard)
@Controller('ventas')
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Post()
  create(
    @Body() dto: CreateSaleDto,
    @CurrentUser() usuario: any,
  ) {
    return this.salesService.create(dto, usuario.empresa_id, usuario.email);
  }

  @Get()
  findAll(@CurrentUser() usuario: any) {
    return this.salesService.findAll(usuario.empresa_id);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() usuario: any,
  ) {
    return this.salesService.findOne(id, usuario.empresa_id);
  }
}
