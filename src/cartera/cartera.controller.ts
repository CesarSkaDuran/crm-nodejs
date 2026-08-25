import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CarteraService } from './cartera.service';
import { CreateCobroDto } from './dto/create-cobro.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiBearerAuth()
@ApiTags('Cartera')
@UseGuards(JwtAuthGuard)
@Controller('cartera')
export class CarteraController {
  constructor(private readonly carteraService: CarteraService) {}

  @Get()
  findAll(
    @Query() query: any,
    @CurrentUser() usuario: any,
  ) {
    return this.carteraService.findAll(query, usuario.empresa_id);
  }

  @Get(':terceroId')
  findOne(
    @Param('terceroId', ParseIntPipe) terceroId: number,
    @CurrentUser() usuario: any,
  ) {
    return this.carteraService.findOne(terceroId, usuario.empresa_id);
  }

  @Post('cobro')
  cobrar(
    @Body() dto: CreateCobroDto,
    @CurrentUser() usuario: any,
  ) {
    return this.carteraService.cobrar(dto, usuario.empresa_id, usuario.name);
  }
}
