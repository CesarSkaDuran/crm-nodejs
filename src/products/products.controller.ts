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
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiBearerAuth()
@ApiTags('Productos')
@UseGuards(JwtAuthGuard)
@Controller('productos')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  create(
    @Body() dto: CreateProductDto,
    @CurrentUser() usuario: any,
  ) {
    return this.productsService.create(dto, usuario.empresa_id);
  }

  @Get()
  findAll(
    @Query('categoria_id') categoriaId: string,
    @CurrentUser() usuario: any,
  ) {
    return this.productsService.findAll(
      usuario.empresa_id,
      categoriaId ? Number(categoriaId) : undefined,
    );
  }

  @Get('sugerir-cuentas')
  sugerirCuentas(
    @Query('tipo') tipo: string,
    @Query('categoria') categoria: string,
    @CurrentUser() usuario: any,
  ) {
    return this.productsService.sugerirCuentas(
      Number(tipo || 1),
      categoria,
      usuario.empresa_id,
    );
  }

  @Get(':id')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() usuario: any,
  ) {
    return this.productsService.findOne(id, usuario.empresa_id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateProductDto,
    @CurrentUser() usuario: any,
  ) {
    return this.productsService.update(id, usuario.empresa_id, dto);
  }

  @Delete(':id')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() usuario: any,
  ) {
    return this.productsService.remove(id, usuario.empresa_id);
  }
}
