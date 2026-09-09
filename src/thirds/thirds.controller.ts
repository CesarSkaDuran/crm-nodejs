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
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiQuery } from '@nestjs/swagger';
import { ThirdsService } from './thirds.service';
import { CreateThirdDto } from './dto/create-third.dto';
import { UpdateThirdDto } from './dto/update-third.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { UserRole } from '../users/entities/user.entity';
import { Roles } from '../common/decorators/roles.decorator';

@ApiBearerAuth()
@ApiTags('Terceros')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('terceros')
export class ThirdsController {
  constructor(private readonly thirdsService: ThirdsService) {}

  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @Post()
  create(
    @Body() dto: CreateThirdDto,
    @CurrentUser() usuario: any,
  ) {
    return this.thirdsService.create(dto, usuario.empresa_id);
  }

  @Get()
  @ApiQuery({
    name: 'tipo_terceros',
    required: false,
    description: '1 cliente, 2 proveedor, 3 empleado, 4 vendedor, 5 otro',
  })
  findAll(
    @CurrentUser() usuario: any,
    @Query('tipo_terceros') tipoTerceros?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('date') date?: string,
    @Query('date2') date2?: string,
  ) {
    return this.thirdsService.findAll(
      {
        tipo_terceros: tipoTerceros,
        search,
        page,
        limit,
        date,
        date2,
      },
      usuario.empresa_id,
    );
  }

  @Get(':id')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() usuario: any,
  ) {
    return this.thirdsService.findOne(id, usuario.empresa_id);
  }

  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateThirdDto,
    @CurrentUser() usuario: any,
  ) {
    return this.thirdsService.update(id, usuario.empresa_id, dto);
  }

  @Roles(UserRole.ADMIN, UserRole.CONTADOR)
  @Delete(':id')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() usuario: any,
  ) {
    return this.thirdsService.remove(id, usuario.empresa_id);
  }
}