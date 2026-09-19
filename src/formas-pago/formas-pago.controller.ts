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
import { FormasPagoService } from './formas-pago.service';
import { CreateFormaPagoDto } from './dto/create-forma-pago.dto';
import { UpdateFormaPagoDto } from './dto/update-forma-pago.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { UserRole } from '../users/entities/user.entity';
import { Roles } from '../common/decorators/roles.decorator';

@ApiBearerAuth()
@ApiTags('Formas de Pago')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('formas-pago')
export class FormasPagoController {
  constructor(private readonly service: FormasPagoService) {}

  @Get()
  @ApiOperation({ summary: 'Listar formas de pago' })
  findAll(
    @Query() query: any,
    @CurrentUser() usuario: any,
  ) {
    return this.service.findAll(query, usuario.empresa_id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener forma de pago por ID' })
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() usuario: any,
  ) {
    return this.service.findOne(id, usuario.empresa_id);
  }

  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @Post()
  @ApiOperation({ summary: 'Crear forma de pago' })
  create(
    @Body() dto: CreateFormaPagoDto,
    @CurrentUser() usuario: any,
  ) {
    return this.service.create(dto, usuario.empresa_id);
  }

  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar forma de pago' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateFormaPagoDto,
    @CurrentUser() usuario: any,
  ) {
    return this.service.update(id, usuario.empresa_id, dto);
  }

  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar forma de pago' })
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() usuario: any,
  ) {
    return this.service.remove(id, usuario.empresa_id);
  }
}
