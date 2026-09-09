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
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';

@ApiBearerAuth()
@ApiTags('Productos')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('productos')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  create(
    @Body() dto: CreateProductDto,
    @CurrentUser() usuario: any,
  ) {
    return this.productsService.create(dto, usuario.empresa_id);
  }

  /**
   * Importación masiva de productos desde Excel/CSV.
   * Body: { filas: [{ codigo, nombre, categoria, grupo, stock, ... }] }
   * Retorna: { creados, actualizados, errores, total }
   */
  @Post('import')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  importar(
    @Body() body: { filas: any[] },
    @CurrentUser() usuario: any,
  ) {
    if (!body?.filas || !Array.isArray(body.filas)) {
      return { creados: 0, actualizados: 0, errores: [{ error: 'Se requiere un arreglo "filas"' }], total: 0 };
    }
    return this.productsService.importar(body.filas, usuario.empresa_id);
  }

  @Get()
  findAll(
    @CurrentUser() usuario: any,
    @Query('categoria_id') categoriaId?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.productsService.findAll(
      {
        categoria_id: categoriaId ? Number(categoriaId) : undefined,
        search,
        page,
        limit,
      },
      usuario.empresa_id,
    );
  }

  @Post(':id/imagen')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        imagen: { type: 'string', format: 'binary' },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('imagen', {
      storage: diskStorage({
        destination: join(process.cwd(), 'uploads', 'productos'),
        filename: (req, file, cb) => {
          const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
          cb(null, `producto-${req.params.id}-${unique}${extname(file.originalname)}`);
        },
      }),
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (req, file, cb) => {
        if (!file.mimetype.match(/^image\/(jpeg|jpg|png|gif|webp)$/)) {
          return cb(
            new BadRequestException('Solo se permiten imágenes (jpg, png, gif, webp)'),
            false,
          );
        }
        cb(null, true);
      },
    }),
  )
  uploadImagen(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: any,
    @Query('index') index: string,
    @CurrentUser() usuario: any,
  ) {
    if (!file) {
      throw new BadRequestException('No se recibió ningún archivo');
    }
    const idx = Number(index || 1);
    if (![1, 2].includes(idx)) {
      throw new BadRequestException('El índice debe ser 1 o 2');
    }
    const ruta = `/uploads/productos/${file.filename}`;
    return this.productsService.updateImagen(id, usuario.empresa_id, ruta, idx);
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
  @Roles(UserRole.ADMIN, UserRole.CONTADOR, UserRole.VENDEDOR)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateProductDto,
    @CurrentUser() usuario: any,
  ) {
    return this.productsService.update(id, usuario.empresa_id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() usuario: any,
  ) {
    return this.productsService.remove(id, usuario.empresa_id);
  }
}
