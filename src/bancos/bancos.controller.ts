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
import { BancosService } from './bancos.service';
import { CreateBancoDto } from './dto/create-banco.dto';
import { UpdateBancoDto } from './dto/update-banco.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiBearerAuth()
@ApiTags('Bancos')
@UseGuards(JwtAuthGuard)
@Controller('bancos')
export class BancosController {
  constructor(private readonly bancosService: BancosService) {}

  @Get()
  findAll(
    @Query() query: any,
    @CurrentUser() usuario: any,
  ) {
    return this.bancosService.findAll(query, usuario.empresa_id);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() usuario: any,
  ) {
    return this.bancosService.findOne(id, usuario.empresa_id);
  }

  @Post()
  create(
    @Body() dto: CreateBancoDto,
    @CurrentUser() usuario: any,
  ) {
    return this.bancosService.create(dto, usuario.empresa_id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateBancoDto,
    @CurrentUser() usuario: any,
  ) {
    return this.bancosService.update(id, usuario.empresa_id, dto);
  }

  @Delete(':id')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() usuario: any,
  ) {
    return this.bancosService.remove(id, usuario.empresa_id);
  }
}
