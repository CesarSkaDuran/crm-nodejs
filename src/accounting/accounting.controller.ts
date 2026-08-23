import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Query,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AccountingService } from './accounting.service';
import { CreateAsentadoDto } from './dto/create-accounting-entry.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiBearerAuth()
@ApiTags('Contabilidad')
@UseGuards(JwtAuthGuard)
@Controller('asentados')
export class AccountingController {
  constructor(private readonly accountingService: AccountingService) {}

  @Get()
  findAll(
    @Query() query: any,
    @CurrentUser() usuario: any,
  ) {
    return this.accountingService.findAll(query, usuario.empresa_id);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() usuario: any,
  ) {
    return this.accountingService.findOne(id, usuario.empresa_id);
  }

  @Post()
  create(
    @Body() dto: CreateAsentadoDto,
    @CurrentUser() usuario: any,
  ) {
    return this.accountingService.create(dto, usuario.empresa_id, usuario.name);
  }

  @Delete(':id')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() usuario: any,
  ) {
    return this.accountingService.remove(id, usuario.empresa_id);
  }
}
