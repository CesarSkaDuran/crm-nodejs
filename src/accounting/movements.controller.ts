import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AccountingService } from './accounting.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiBearerAuth()
@ApiTags('Movimientos contables')
@UseGuards(JwtAuthGuard)
@Controller('movimientos')
export class MovementsController {
  constructor(private readonly accountingService: AccountingService) {}

  @Get()
  findAll(
    @Query() query: any,
    @CurrentUser() usuario: any,
  ) {
    return this.accountingService.findAllLines(query, usuario.empresa_id);
  }
}
