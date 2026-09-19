import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PartidasRecurrentesService } from './partidas-recurrentes.service';
import {
  CreatePartidaRecurrenteDto,
  UpdatePartidaRecurrenteDto,
} from './dto/partida-recurrente.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { UserRole } from '../users/entities/user.entity';
import { Roles } from '../common/decorators/roles.decorator';

@ApiBearerAuth()
@ApiTags('Partidas recurrentes')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('partidas-recurrentes')
export class PartidasRecurrentesController {
  constructor(private readonly service: PartidasRecurrentesService) {}

  @Get()
  findAll(@CurrentUser() usuario: any) {
    return this.service.findAll(usuario.empresa_id);
  }

  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @Post()
  create(@Body() dto: CreatePartidaRecurrenteDto, @CurrentUser() usuario: any) {
    return this.service.create(dto, usuario.empresa_id);
  }

  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePartidaRecurrenteDto,
    @CurrentUser() usuario: any,
  ) {
    return this.service.update(id, dto, usuario.empresa_id);
  }

  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() usuario: any) {
    return this.service.remove(id, usuario.empresa_id);
  }
}
