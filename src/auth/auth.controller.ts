import { Controller, Post, Body } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';

@ApiTags('Autenticacion')
@Controller('autenticacion')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('iniciar-sesion')
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }
}
