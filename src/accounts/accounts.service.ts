import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Account } from './entities/account.entity';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';

@Injectable()
export class AccountsService {
  constructor(
    @InjectRepository(Account)
    private readonly repo: Repository<Account>,
  ) {}

  private async validarPadre(empresaId: number, padreId?: number) {
    if (!padreId) return;
    const padre = await this.repo.findOne({
      where: { id: padreId, empresa_id: empresaId },
    });
    if (!padre) {
      throw new BadRequestException(
        'La cuenta padre no existe en esta empresa',
      );
    }
  }

  async create(dto: CreateAccountDto, empresaId: number) {
    const exists = await this.repo.findOne({
      where: { codigo: dto.codigo, empresa_id: empresaId },
    });
    if (exists) {
      throw new ConflictException(
        'El código de cuenta ya existe en esta empresa',
      );
    }

    await this.validarPadre(empresaId, dto.cuenta_padre_id);

    const cuenta = this.repo.create({ ...dto, empresa_id: empresaId });
    return this.repo.save(cuenta);
  }

  findAll(empresaId: number) {
    return this.repo.find({
      where: { empresa_id: empresaId },
      order: { codigo: 'ASC' },
    });
  }

  async findOne(id: number, empresaId: number) {
    const cuenta = await this.repo.findOne({
      where: { id, empresa_id: empresaId },
      relations: ['cuenta_padre', 'hijas'],
    });
    if (!cuenta) {
      throw new NotFoundException('Cuenta no encontrada');
    }
    return cuenta;
  }

  async update(id: number, empresaId: number, dto: UpdateAccountDto) {
    const cuenta = await this.findOne(id, empresaId);

    if (dto.codigo && dto.codigo !== cuenta.codigo) {
      const exists = await this.repo.findOne({
        where: { codigo: dto.codigo, empresa_id: empresaId },
      });
      if (exists) {
        throw new ConflictException(
          'El código de cuenta ya existe en esta empresa',
        );
      }
    }

    if (dto.cuenta_padre_id !== undefined) {
      if (dto.cuenta_padre_id === id) {
        throw new BadRequestException(
          'Una cuenta no puede ser padre de sí misma',
        );
      }
      await this.validarPadre(empresaId, dto.cuenta_padre_id);
    }

    Object.assign(cuenta, dto);
    return this.repo.save(cuenta);
  }

  async remove(id: number, empresaId: number) {
    const cuenta = await this.findOne(id, empresaId);
    const hijas = await this.repo.count({
      where: { cuenta_padre_id: id, empresa_id: empresaId },
    });
    if (hijas > 0) {
      throw new BadRequestException(
        'No se puede eliminar una cuenta con subcuentas',
      );
    }
    await this.repo.remove(cuenta);
  }
}
