import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AccountsService } from './accounts.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiBearerAuth()
@ApiTags('Cuentas')
@UseGuards(JwtAuthGuard)
@Controller('cuentas')
export class AccountsController {
  constructor(private readonly accountsService: AccountsService) {}

  @Post()
  create(
    @Body() dto: CreateAccountDto,
    @CurrentUser() usuario: any,
  ) {
    return this.accountsService.create(dto, usuario.empresa_id);
  }

  @Get()
  findAll(@CurrentUser() usuario: any) {
    return this.accountsService.findAll(usuario.empresa_id);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() usuario: any,
  ) {
    return this.accountsService.findOne(id, usuario.empresa_id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAccountDto,
    @CurrentUser() usuario: any,
  ) {
    return this.accountsService.update(id, usuario.empresa_id, dto);
  }

  @Delete(':id')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() usuario: any,
  ) {
    return this.accountsService.remove(id, usuario.empresa_id);
  }
}
