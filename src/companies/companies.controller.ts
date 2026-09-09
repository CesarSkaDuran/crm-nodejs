import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  ParseIntPipe,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { ApiBearerAuth, ApiTags, ApiConsumes, ApiBody, ApiOperation } from '@nestjs/swagger';
import { CompaniesService } from './companies.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { UserRole } from '../users/entities/user.entity';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiBearerAuth()
@ApiTags('Empresas')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('empresas')
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @Post()
  create(@Body() dto: CreateCompanyDto) {
    return this.companiesService.create(dto);
  }

  @Get('mi-empresa')
  @ApiOperation({ summary: 'Obtener datos de la empresa del usuario autenticado' })
  miEmpresa(@CurrentUser() usuario: any) {
    return this.companiesService.findOne(usuario.empresa_id);
  }

  @Roles(UserRole.ADMIN)
  @Patch('mi-empresa')
  @ApiOperation({ summary: 'Actualizar datos de la empresa del usuario autenticado' })
  updateMiEmpresa(
    @Body() dto: UpdateCompanyDto,
    @CurrentUser() usuario: any,
  ) {
    // No permitir cambiar el código ni el estado desde este endpoint
    delete (dto as any).codigo;
    delete (dto as any).estado;
    return this.companiesService.update(usuario.empresa_id, dto);
  }

  @Roles(UserRole.ADMIN)
  @Post('mi-empresa/logo')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { logo: { type: 'string', format: 'binary' } },
    },
  })
  @ApiOperation({ summary: 'Subir logo de la empresa' })
  @UseInterceptors(
    FileInterceptor('logo', {
      storage: diskStorage({
        destination: join(process.cwd(), 'uploads', 'empresas'),
        filename: (req, file, cb) => {
          const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
          cb(null, `empresa-${unique}${extname(file.originalname)}`);
        },
      }),
      limits: { fileSize: 5 * 1024 * 1024 },
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
  uploadLogo(@UploadedFile() file: any, @CurrentUser() usuario: any) {
    if (!file) {
      throw new BadRequestException('No se recibió ningún archivo');
    }
    const ruta = `/uploads/empresas/${file.filename}`;
    return this.companiesService.guardarLogo(usuario.empresa_id, ruta);
  }

  @Get()
  findAll() {
    return this.companiesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.companiesService.findOne(id);
  }

  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCompanyDto,
  ) {
    return this.companiesService.update(id, dto);
  }

  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.companiesService.remove(id);
  }
}