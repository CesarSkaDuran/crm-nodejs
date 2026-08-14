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
import { PurchasesService } from './purchases.service';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiBearerAuth()
@ApiTags('Compras')
@UseGuards(JwtAuthGuard)
@Controller('compras')
export class PurchasesController {
  constructor(private readonly purchasesService: PurchasesService) {}

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
  findAll(@CurrentUser() usuario: any) {
    return this.purchasesService.findAll(usuario.empresa_id);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() usuario: any,
  ) {
    return this.purchasesService.findOne(id, usuario.empresa_id);
  }
}
