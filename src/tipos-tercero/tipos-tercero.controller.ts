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
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { TiposTerceroService } from './tipos-tercero.service';
import { CreateTipoTerceroDto } from './dto/create-tipo-tercero.dto';
import { UpdateTipoTerceroDto } from './dto/update-tipo-tercero.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { UserRole } from '../users/entities/user.entity';
import { Roles } from '../common/decorators/roles.decorator';

@ApiBearerAuth()
@ApiTags('Tipos de Tercero')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('tipos-tercero')
export class TiposTerceroController {
  constructor(private readonly service: TiposTerceroService) {}

  @Get()
  @ApiOperation({ summary: 'Listar tipos de tercero' })
  findAll(
    @Query() query: any,
    @CurrentUser() usuario: any,
  ) {
    return this.service.findAll(query, usuario.empresa_id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener tipo de tercero por ID' })
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() usuario: any,
  ) {
    return this.service.findOne(id, usuario.empresa_id);
  }

  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @Post()
  @ApiOperation({ summary: 'Crear tipo de tercero' })
  create(
    @Body() dto: CreateTipoTerceroDto,
    @CurrentUser() usuario: any,
  ) {
    return this.service.create(dto, usuario.empresa_id);
  }

  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar tipo de tercero' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTipoTerceroDto,
    @CurrentUser() usuario: any,
  ) {
    return this.service.update(id, usuario.empresa_id, dto);
  }

  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar tipo de tercero' })
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() usuario: any,
  ) {
    return this.service.remove(id, usuario.empresa_id);
  }
}
