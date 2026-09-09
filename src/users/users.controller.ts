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
import { ApiBearerAuth, ApiTags, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from './entities/user.entity';

@ApiBearerAuth()
@ApiTags('Usuarios')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('usuarios')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @Roles(UserRole.ADMIN)
  create(
    @Body() dto: CreateUserDto,
    @CurrentUser() usuario: any,
  ) {
    return this.usersService.create(dto, usuario.empresa_id, usuario.nombre);
  }

  @Get()
  findAll(@CurrentUser() usuario: any) {
    return this.usersService.findAll(usuario.empresa_id);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() usuario: any,
  ) {
    return this.usersService.findOne(id, usuario.empresa_id);
  }

  @Post(':id/foto')
  @Roles(UserRole.ADMIN)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        foto: { type: 'string', format: 'binary' },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('foto', {
      storage: diskStorage({
        destination: join(process.cwd(), 'uploads', 'usuarios'),
        filename: (req, file, cb) => {
          const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
          cb(null, `usuario-${req.params.id}-${unique}${extname(file.originalname)}`);
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
  uploadFoto(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: any,
    @CurrentUser() usuario: any,
  ) {
    if (!file) {
      throw new BadRequestException('No se recibió ningún archivo');
    }
    const ruta = `/uploads/usuarios/${file.filename}`;
    return this.usersService.guardarFoto(id, usuario.empresa_id, ruta, usuario.nombre);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserDto,
    @CurrentUser() usuario: any,
  ) {
    return this.usersService.update(id, usuario.empresa_id, dto, usuario.nombre);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() usuario: any,
  ) {
    return this.usersService.remove(id, usuario.empresa_id, usuario.nombre);
  }
}
