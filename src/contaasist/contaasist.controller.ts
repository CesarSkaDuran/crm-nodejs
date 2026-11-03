import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { ContaAsistChatDto } from './dto/contaasist-chat.dto';
import { ContaAsistService } from './contaasist.service';

@ApiBearerAuth()
@ApiTags('ContaAsist')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('contaasist')
export class ContaAsistController {
  constructor(private readonly contaAsist: ContaAsistService) {}

  @Post('chat')
  chat(@Body() dto: ContaAsistChatDto, @CurrentUser() user: any) {
    return this.contaAsist.chat(dto, Number(user.empresa_id));
  }
}
