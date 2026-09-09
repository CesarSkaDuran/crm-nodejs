import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SalesService } from './sales.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { UserRole } from '../users/entities/user.entity';
import { Roles } from '../common/decorators/roles.decorator';

@ApiBearerAuth()
@ApiTags('Ventas')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('ventas')
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  @Post()
  create(
    @Body() dto: CreateSaleDto,
    @CurrentUser() usuario: any,
  ) {
    return this.salesService.create(dto, usuario.empresa_id, usuario.email);
  }

  @Get()
  findAll(
    @CurrentUser() usuario: any,
    @Query() query: any,
  ) {
    return this.salesService.findAll(query, usuario.empresa_id);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() usuario: any,
  ) {
    return this.salesService.findOne(id, usuario.empresa_id);
  }

  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  @Post(':id/anular')
  anular(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() usuario: any,
  ) {
    return this.salesService.anular(id, usuario.empresa_id, usuario.email);
  }
}