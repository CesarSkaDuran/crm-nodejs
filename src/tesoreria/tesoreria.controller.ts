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
import { TesoreriaService } from './tesoreria.service';
import { CreateTesoreriaDto } from './dto/create-tesoreria.dto';
import { UpdateTesoreriaDto } from './dto/update-tesoreria.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiBearerAuth()
@ApiTags('Tesoreria')
@UseGuards(JwtAuthGuard)
@Controller('tesoreria')
export class TesoreriaController {
  constructor(private readonly tesoreriaService: TesoreriaService) {}

  @Get()
  findAll(
    @Query() query: any,
    @CurrentUser() usuario: any,
  ) {
    return this.tesoreriaService.findAll(query, usuario.empresa_id);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() usuario: any,
  ) {
    return this.tesoreriaService.findOne(id, usuario.empresa_id);
  }

  @Post()
  create(
    @Body() dto: CreateTesoreriaDto,
    @CurrentUser() usuario: any,
  ) {
    return this.tesoreriaService.create(dto, usuario.empresa_id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTesoreriaDto,
    @CurrentUser() usuario: any,
  ) {
    return this.tesoreriaService.update(id, usuario.empresa_id, dto);
  }

  @Delete(':id')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() usuario: any,
  ) {
    return this.tesoreriaService.remove(id, usuario.empresa_id);
  }
}
