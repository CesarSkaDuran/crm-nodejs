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
import { MonedasService } from './monedas.service';
import { CreateMonedaDto } from './dto/create-moneda.dto';
import { UpdateMonedaDto } from './dto/update-moneda.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { UserRole } from '../users/entities/user.entity';
import { Roles } from '../common/decorators/roles.decorator';

@ApiBearerAuth()
@ApiTags('Monedas')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('monedas')
export class MonedasController {
  constructor(private readonly service: MonedasService) {}

  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @Post()
  create(@Body() dto: CreateMonedaDto, @CurrentUser() usuario: any) {
    return this.service.create(dto, usuario.empresa_id);
  }

  @Get()
  findAll(@CurrentUser() usuario: any) {
    return this.service.findAll(usuario.empresa_id);
  }

  @Get('local')
  findLocal(@CurrentUser() usuario: any) {
    return this.service.findLocal(usuario.empresa_id);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number, @CurrentUser() usuario: any) {
    return this.service.findOne(id, usuario.empresa_id);
  }

  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateMonedaDto,
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