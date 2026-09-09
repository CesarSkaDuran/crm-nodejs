import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import { User } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { AuditoriaService } from '../auditoria/auditoria.service';
import { TipoOperacion } from '../auditoria/entities/auditoria.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly repo: Repository<User>,
    private readonly auditoria: AuditoriaService,
  ) {}

  async create(dto: CreateUserDto, empresaId: number, usuarioActual?: string) {
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

    await this.auditoria.registrar(
      empresaId,
      'usuarios',
      saved.id,
      TipoOperacion.CREAR,
      usuarioActual || 'sistema',
      null,
      result,
      `Usuario ${result.nombre} creado`,
    );

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

  async update(id: number, empresaId: number, dto: UpdateUserDto, usuarioActual?: string) {
    const usuario = await this.findOne(id, empresaId);
    const { password: passwordAnterior, ...valoresAnteriores } = usuario;

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

    await this.auditoria.registrar(
      empresaId,
      'usuarios',
      id,
      TipoOperacion.ACTUALIZAR,
      usuarioActual || 'sistema',
      valoresAnteriores,
      result,
      `Usuario ${result.nombre} actualizado`,
    );

    return result;
  }

  async guardarFoto(id: number, empresaId: number, ruta: string, usuarioActual?: string) {
    const usuario = await this.findOne(id, empresaId);
    const fotoAnterior = usuario.foto;

    usuario.foto = ruta;
    const saved = await this.repo.save(usuario);
    const { password, ...result } = saved;

    // Eliminar archivo anterior si existía
    if (fotoAnterior && fotoAnterior.startsWith('/uploads/')) {
      const rutaAnterior = join(process.cwd(), fotoAnterior);
      if (existsSync(rutaAnterior)) {
        try {
          unlinkSync(rutaAnterior);
        } catch {}
      }
    }

    await this.auditoria.registrar(
      empresaId,
      'usuarios',
      id,
      TipoOperacion.ACTUALIZAR,
      usuarioActual || 'sistema',
      { foto: fotoAnterior },
      { foto: ruta },
      `Foto del usuario ${result.nombre} actualizada`,
    );

    return result;
  }

  async remove(id: number, empresaId: number, usuarioActual?: string) {
    const usuario = await this.findOne(id, empresaId);
    const { password, ...valoresAnteriores } = usuario;
    await this.repo.remove(usuario);

    await this.auditoria.registrar(
      empresaId,
      'usuarios',
      id,
      TipoOperacion.ELIMINAR,
      usuarioActual || 'sistema',
      valoresAnteriores,
      null,
      `Usuario ${valoresAnteriores.nombre} eliminado`,
    );
  }
}
