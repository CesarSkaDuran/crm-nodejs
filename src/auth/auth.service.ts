import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User } from '../users/entities/user.entity';
import { Company } from '../companies/entities/company.entity';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Company)
    private readonly companyRepo: Repository<Company>,
    private readonly jwtService: JwtService,
  ) {}

  async login(dto: LoginDto) {
    const empresa = await this.companyRepo.findOne({
      where: { codigo: dto.codigo_empresa },
    });

    if (!empresa || empresa.estado !== 1) {
      throw new UnauthorizedException('Empresa no encontrada o inactiva');
    }

    const usuario = await this.userRepo.findOne({
      where: { email: dto.email, empresa_id: empresa.id },
      select: [
        'id',
        'empresa_id',
        'email',
        'password',
        'rol',
        'estado',
        'nombre',
      ],
    });

    if (!usuario || usuario.estado !== 1) {
      throw new UnauthorizedException('Usuario no encontrado o inactivo');
    }

    const match = await bcrypt.compare(dto.password, usuario.password);
    if (!match) {
      throw new UnauthorizedException('Contraseña incorrecta');
    }

    const payload = {
      sub: usuario.id,
      empresa_id: empresa.id,
      codigo_empresa: empresa.codigo,
      nombre: usuario.nombre,
      email: usuario.email,
      rol: usuario.rol,
    };

    return {
      access_token: this.jwtService.sign(payload),
      usuario: {
        id: usuario.id,
        empresa_id: empresa.id,
        codigo_empresa: empresa.codigo,
        nombre_empresa: empresa.nombre,
        nombre: usuario.nombre,
        email: usuario.email,
        rol: usuario.rol,
      },
    };
  }
}
