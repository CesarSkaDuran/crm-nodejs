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
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';

@ApiBearerAuth()
@ApiTags('Cuentas')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('cuentas')
export class AccountsController {
  constructor(private readonly accountsService: AccountsService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  create(
    @Body() dto: CreateAccountDto,
    @CurrentUser() usuario: any,
  ) {
    return this.accountsService.create(dto, usuario.empresa_id);
  }

  /**
   * Importación masiva del plan de cuentas desde Excel/CSV.
   * Body: { filas: [{ codigo, nombre, naturaleza, clasificacion, ... }] }
   * Resuelve automáticamente la jerarquía (cuenta_padre_id) por prefijo de código.
   * Retorna: { creados, actualizados, errores, total }
   */
  @Post('import')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  importar(
    @Body() body: { filas: any[] },
    @CurrentUser() usuario: any,
  ) {
    if (!body?.filas || !Array.isArray(body.filas)) {
      return { creados: 0, actualizados: 0, errores: [{ error: 'Se requiere un arreglo "filas"' }], total: 0 };
    }
    return this.accountsService.importar(body.filas, usuario.empresa_id);
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
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAccountDto,
    @CurrentUser() usuario: any,
  ) {
    return this.accountsService.update(id, usuario.empresa_id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() usuario: any,
  ) {
    return this.accountsService.remove(id, usuario.empresa_id);
  }
}
