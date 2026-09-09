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
import { ImpuestosService } from './impuestos.service';
import { CreateImpuestoDto } from './dto/create-impuesto.dto';
import { UpdateImpuestoDto } from './dto/update-impuesto.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { UserRole } from '../users/entities/user.entity';
import { Roles } from '../common/decorators/roles.decorator';

@ApiBearerAuth()
@ApiTags('Impuestos')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('impuestos')
export class ImpuestosController {
  constructor(private readonly service: ImpuestosService) {}

  @Get()
  @ApiOperation({ summary: 'Listar impuestos' })
  findAll(
    @Query() query: any,
    @CurrentUser() usuario: any,
  ) {
    return this.service.findAll(query, usuario.empresa_id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener impuesto por ID' })
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() usuario: any,
  ) {
    return this.service.findOne(id, usuario.empresa_id);
  }

  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @Post()
  @ApiOperation({ summary: 'Crear impuesto' })
  create(
    @Body() dto: CreateImpuestoDto,
    @CurrentUser() usuario: any,
  ) {
    return this.service.create(dto, usuario.empresa_id);
  }

  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar impuesto' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateImpuestoDto,
    @CurrentUser() usuario: any,
  ) {
    return this.service.update(id, usuario.empresa_id, dto);
  }

  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar impuesto' })
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() usuario: any,
  ) {
    return this.service.remove(id, usuario.empresa_id);
  }
}
