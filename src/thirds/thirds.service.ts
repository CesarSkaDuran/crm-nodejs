import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Third } from './entities/third.entity';
import { CreateThirdDto } from './dto/create-third.dto';
import { UpdateThirdDto } from './dto/update-third.dto';
import { Account } from '../accounts/entities/account.entity';

@Injectable()
export class ThirdsService {
  constructor(
    @InjectRepository(Third)
    private readonly repo: Repository<Third>,
    @InjectRepository(Account)
    private readonly cuentaRepo: Repository<Account>,
  ) {}

  private async validarCuenta(empresaId: number, cuentaId?: number) {
    if (!cuentaId) return;
    const cuenta = await this.cuentaRepo.findOne({
      where: { id: cuentaId, empresa_id: empresaId },
    });
    if (!cuenta) {
      throw new BadRequestException(
        'La cuenta contable no existe en esta empresa',
      );
    }
  }

  private async generarCodigo(empresaId: number): Promise<string> {
    const total = await this.repo.count({ where: { empresa_id: empresaId } });
    let consecutivo = total + 1;
    let codigo = `TER${consecutivo.toString().padStart(4, '0')}`;

    while (await this.repo.findOne({ where: { codigo, empresa_id: empresaId } })) {
      consecutivo++;
      codigo = `TER${consecutivo.toString().padStart(4, '0')}`;
    }

    return codigo;
  }

  async create(dto: CreateThirdDto, empresaId: number) {
    const codigo = dto.codigo?.trim() || (await this.generarCodigo(empresaId));

    const exists = await this.repo.findOne({
      where: { codigo, empresa_id: empresaId },
    });
    if (exists) {
      throw new ConflictException(
        'El código de tercero ya existe en esta empresa',
      );
    }

    await this.validarCuenta(empresaId, dto.cuenta_contable_id);

    const tercero = this.repo.create({ ...dto, codigo, empresa_id: empresaId });
    return this.repo.save(tercero);
  }

  findAll(empresaId: number, tipoTerceros?: number) {
    const where: any = { empresa_id: empresaId };
    if (tipoTerceros) where.tipo_terceros = tipoTerceros;
    return this.repo.find({
      where,
      relations: ['cuenta_contable'],
      order: { nombre: 'ASC' },
    });
  }

  async findOne(id: number, empresaId: number) {
    const tercero = await this.repo.findOne({
      where: { id, empresa_id: empresaId },
      relations: ['cuenta_contable'],
    });
    if (!tercero) {
      throw new NotFoundException('Tercero no encontrado');
    }
    return tercero;
  }

  async update(id: number, empresaId: number, dto: UpdateThirdDto) {
    const tercero = await this.findOne(id, empresaId);

    if (dto.codigo && dto.codigo !== tercero.codigo) {
      const exists = await this.repo.findOne({
        where: { codigo: dto.codigo, empresa_id: empresaId },
      });
      if (exists) {
        throw new ConflictException(
          'El código de tercero ya existe en esta empresa',
        );
      }
    }

    if (dto.cuenta_contable_id !== undefined) {
      await this.validarCuenta(empresaId, dto.cuenta_contable_id);
    }

    Object.assign(tercero, dto);
    return this.repo.save(tercero);
  }

  async remove(id: number, empresaId: number) {
    const tercero = await this.findOne(id, empresaId);
    await this.repo.remove(tercero);
  }
}
