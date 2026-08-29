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
import { CreateCreditoDto } from './dto/create-credito.dto';
import { RegistrarCobroDto } from './dto/registrar-cobro.dto';
import { PosfecharCuotaDto } from './dto/posfechar-cuota.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiBearerAuth()
@ApiTags('Cartera')
@UseGuards(JwtAuthGuard)
@Controller('cartera')
export class CarteraController {
  constructor(private readonly carteraService: CarteraService) {}

  @Get()
  findAll(@Query() query: any, @CurrentUser() usuario: any) {
    return this.carteraService.findAll(query, usuario.empresa_id);
  }

  @Get('cuotas-vencidas')
  cuotasVencidas(@Query() query: any, @CurrentUser() usuario: any) {
    return this.carteraService.cuotasVencidas(usuario.empresa_id, query);
  }

  @Get('credito/:creditoId')
  findCredito(
    @Param('creditoId', ParseIntPipe) creditoId: number,
    @CurrentUser() usuario: any,
  ) {
    return this.carteraService.findCredito(creditoId, usuario.empresa_id);
  }

  @Get(':terceroId')
  findOne(
    @Param('terceroId', ParseIntPipe) terceroId: number,
    @CurrentUser() usuario: any,
  ) {
    return this.carteraService.findOne(terceroId, usuario.empresa_id);
  }

  @Post('credito')
  crearCredito(
    @Body() dto: CreateCreditoDto,
    @CurrentUser() usuario: any,
  ) {
    return this.carteraService.crearCredito(dto, usuario.empresa_id, usuario.name);
  }

  @Post('cobro')
  cobrar(
    @Body() dto: RegistrarCobroDto,
    @CurrentUser() usuario: any,
  ) {
    return this.carteraService.cobrar(dto, usuario.empresa_id, usuario.name);
  }

  @Post('posfechar')
  posfechar(
    @Body() dto: PosfecharCuotaDto,
    @CurrentUser() usuario: any,
  ) {
    return this.carteraService.posfecharCuota(dto, usuario.empresa_id);
  }
}
