import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CarteraService } from './cartera.service';
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
}
