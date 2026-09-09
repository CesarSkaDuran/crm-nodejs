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
import { UnidadesMedidaService } from './unidades-medida.service';
import { CreateUnidadMedidaDto } from './dto/create-unidad-medida.dto';
import { UpdateUnidadMedidaDto } from './dto/update-unidad-medida.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { UserRole } from '../users/entities/user.entity';
import { Roles } from '../common/decorators/roles.decorator';

@ApiBearerAuth()
@ApiTags('Unidades de Medida')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('unidades-medida')
export class UnidadesMedidaController {
  constructor(private readonly service: UnidadesMedidaService) {}

  @Get()
  @ApiOperation({ summary: 'Listar unidades de medida' })
  findAll(
    @Query() query: any,
    @CurrentUser() usuario: any,
  ) {
    return this.service.findAll(query, usuario.empresa_id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener unidad de medida por ID' })
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() usuario: any,
  ) {
    return this.service.findOne(id, usuario.empresa_id);
  }

  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @Post()
  @ApiOperation({ summary: 'Crear unidad de medida' })
  create(
    @Body() dto: CreateUnidadMedidaDto,
    @CurrentUser() usuario: any,
  ) {
    return this.service.create(dto, usuario.empresa_id);
  }

  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar unidad de medida' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUnidadMedidaDto,
    @CurrentUser() usuario: any,
  ) {
    return this.service.update(id, usuario.empresa_id, dto);
  }

  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar unidad de medida' })
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() usuario: any,
  ) {
    return this.service.remove(id, usuario.empresa_id);
  }
}
