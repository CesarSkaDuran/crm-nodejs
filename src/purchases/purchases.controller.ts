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
import { PurchasesService } from './purchases.service';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { UserRole } from '../users/entities/user.entity';
import { Roles } from '../common/decorators/roles.decorator';

@ApiBearerAuth()
@ApiTags('Compras')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('compras')
export class PurchasesController {
  constructor(private readonly purchasesService: PurchasesService) {}

  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  @Post()
  create(
    @Body() dto: CreatePurchaseDto,
    @CurrentUser() usuario: any,
  ) {
    return this.purchasesService.create(
      dto,
      usuario.empresa_id,
      usuario.email,
    );
  }

  @Get()
  findAll(
    @CurrentUser() usuario: any,
    @Query() query: any,
  ) {
    return this.purchasesService.findAll(query, usuario.empresa_id);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() usuario: any,
  ) {
    return this.purchasesService.findOne(id, usuario.empresa_id);
  }

  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  @Post(':id/anular')
  anular(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() usuario: any,
  ) {
    return this.purchasesService.anular(id, usuario.empresa_id, usuario.email);
  }
}