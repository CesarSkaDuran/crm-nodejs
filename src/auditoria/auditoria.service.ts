import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { Auditoria, TipoOperacion } from './entities/auditoria.entity';

@Injectable()
export class AuditoriaService {
  constructor(
    @InjectRepository(Auditoria)
    private readonly auditoriaRepo: Repository<Auditoria>,
  ) {}

  async registrar(
    empresaId: number,
    tabla: string,
    registroId: number,
    operacion: TipoOperacion,
    usuario: string,
    valoresAnteriores?: any,
    valoresNuevos?: any,
    descripcion?: string,
    ipOrigen?: string,
  ) {
    const auditoria = this.auditoriaRepo.create({
      empresa_id: empresaId,
      tabla,
      registro_id: registroId,
      operacion,
      usuario,
      valores_anteriores: valoresAnteriores ? JSON.stringify(valoresAnteriores) : null,
      valores_nuevos: valoresNuevos ? JSON.stringify(valoresNuevos) : null,
      descripcion,
      ip_origen: ipOrigen,
      estado: 1,
    });

    return this.auditoriaRepo.save(auditoria);
  }

  async findAll(empresaId: number, query?: any) {
    const page = Math.max(1, Number(query?.page || 1));
    const limit = Math.min(100, Math.max(1, Number(query?.limit || 20)));

    const qb = this.auditoriaRepo
      .createQueryBuilder('a')
      .where('a.empresa_id = :empresaId', { empresaId })
      .orderBy('a.fecha', 'DESC');

    if (query?.tabla) {
      qb.andWhere('a.tabla = :tabla', { tabla: query.tabla });
    }

    if (query?.operacion) {
      qb.andWhere('a.operacion = :operacion', { operacion: query.operacion });
    }

    if (query?.usuario) {
      qb.andWhere('a.usuario = :usuario', { usuario: query.usuario });
    }

    if (query?.fecha_inicio && query?.fecha_fin) {
      qb.andWhere('a.fecha BETWEEN :inicio AND :fin', {
        inicio: query.fecha_inicio,
        fin: query.fecha_fin,
      });
    }

    const [data, total] = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, total, page, limit };
  }

  async findByRegistro(
    empresaId: number,
    tabla: string,
    registroId: number,
  ) {
    return this.auditoriaRepo.find({
      where: {
        empresa_id: empresaId,
        tabla,
        registro_id: registroId,
      },
      order: { fecha: 'DESC' },
    });
  }

  async obtenerCambios(
    empresaId: number,
    tabla: string,
    registroId: number,
  ) {
    const registros = await this.findByRegistro(empresaId, tabla, registroId);

    if (registros.length === 0) {
      return {
        tabla,
        registro_id: registroId,
        cambios: [],
        total_cambios: 0,
      };
    }

    const cambios = registros.map((r) => ({
      fecha: r.fecha,
      operacion: r.operacion,
      usuario: r.usuario,
      valores_anteriores: r.valores_anteriores ? JSON.parse(r.valores_anteriores) : null,
      valores_nuevos: r.valores_nuevos ? JSON.parse(r.valores_nuevos) : null,
      descripcion: r.descripcion,
    }));

    return {
      tabla,
      registro_id: registroId,
      cambios,
      total_cambios: cambios.length,
    };
  }

  async reporteAnulaciones(
    empresaId: number,
    fechaInicio?: string,
    fechaFin?: string,
  ) {
    const qb = this.auditoriaRepo
      .createQueryBuilder('a')
      .where('a.empresa_id = :empresaId', { empresaId })
      .andWhere('a.operacion = :operacion', { operacion: TipoOperacion.ANULAR })
      .orderBy('a.fecha', 'DESC');

    if (fechaInicio && fechaFin) {
      qb.andWhere('a.fecha BETWEEN :inicio AND :fin', {
        inicio: fechaInicio,
        fin: fechaFin,
      });
    }

    const anulaciones = await qb.getMany();

    return {
      periodo: fechaInicio && fechaFin ? `${fechaInicio} a ${fechaFin}` : 'Todo',
      total_anulaciones: anulaciones.length,
      anulaciones: anulaciones.map((a) => ({
        fecha: a.fecha,
        tabla: a.tabla,
        registro_id: a.registro_id,
        usuario: a.usuario,
        descripcion: a.descripcion,
      })),
    };
  }

  async reporteActividad(
    empresaId: number,
    usuario?: string,
    fechaInicio?: string,
    fechaFin?: string,
  ) {
    const qb = this.auditoriaRepo
      .createQueryBuilder('a')
      .where('a.empresa_id = :empresaId', { empresaId });

    if (usuario) {
      qb.andWhere('a.usuario = :usuario', { usuario });
    }

    if (fechaInicio && fechaFin) {
      qb.andWhere('a.fecha BETWEEN :inicio AND :fin', {
        inicio: fechaInicio,
        fin: fechaFin,
      });
    }

    const registros = await qb.orderBy('a.fecha', 'DESC').getMany();

    // Agrupar por tabla y operación
    const mapa = new Map<string, any>();
    for (const r of registros) {
      const clave = `${r.tabla}_${r.operacion}`;
      if (!mapa.has(clave)) {
        mapa.set(clave, {
          tabla: r.tabla,
          operacion: r.operacion,
          cantidad: 0,
          usuarios: new Set<string>(),
        });
      }
      const entry = mapa.get(clave);
      entry.cantidad++;
      entry.usuarios.add(r.usuario);
    }

    const resumen = Array.from(mapa.values()).map((e) => ({
      tabla: e.tabla,
      operacion: e.operacion,
      cantidad: e.cantidad,
      usuarios: Array.from(e.usuarios),
    }));

    return {
      periodo: fechaInicio && fechaFin ? `${fechaInicio} a ${fechaFin}` : 'Todo',
      usuario_filtro: usuario || 'Todos',
      total_registros: registros.length,
      resumen,
    };
  }
}
