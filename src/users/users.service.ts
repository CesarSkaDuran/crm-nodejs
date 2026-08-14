import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly repo: Repository<User>,
  ) {}

  async create(dto: CreateUserDto, empresaId: number) {
    const exists = await this.repo.findOne({
      where: { email: dto.email, empresa_id: empresaId },
    });
    if (exists) {
      throw new ConflictException('El email ya está registrado en esta empresa');
    }

    const hashed = await bcrypt.hash(dto.password, 10);
    const saved = await this.repo.save(
      this.repo.create({
        ...dto,
        empresa_id: empresaId,
        password: hashed,
      }),
    );

    const { password, ...result } = saved;
    return result;
  }

  findAll(empresaId: number) {
    return this.repo.find({
      where: { empresa_id: empresaId },
      order: { nombre: 'ASC' },
    });
  }

  async findOne(id: number, empresaId: number) {
    const usuario = await this.repo.findOne({
      where: { id, empresa_id: empresaId },
    });
    if (!usuario) {
      throw new NotFoundException('Usuario no encontrado');
    }
    return usuario;
  }

  async update(id: number, empresaId: number, dto: UpdateUserDto) {
    const usuario = await this.findOne(id, empresaId);

    if (dto.email && dto.email !== usuario.email) {
      const exists = await this.repo.findOne({
        where: { email: dto.email, empresa_id: empresaId },
      });
      if (exists) {
        throw new ConflictException('El email ya está registrado en esta empresa');
      }
    }

    if (dto.password) {
      dto.password = await bcrypt.hash(dto.password, 10);
    }

    Object.assign(usuario, dto);
    const saved = await this.repo.save(usuario);
    const { password, ...result } = saved;
    return result;
  }

  async remove(id: number, empresaId: number) {
    const usuario = await this.findOne(id, empresaId);
    await this.repo.remove(usuario);
  }
}
