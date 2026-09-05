import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { AccountingEntryLine } from '../accounting/entities/accounting-entry.entity';
import { Account } from '../accounts/entities/account.entity';
import { round2 } from '../accounting/accounting-helpers';

@Injectable()
export class ReportesService {
  constructor(
    @InjectRepository(AccountingEntryLine)
    private readonly lineaRepo: Repository<AccountingEntryLine>,
    @InjectRepository(Account)
    private readonly cuentaRepo: Repository<Account>,
  ) {}

  async balancePrueba(
    empresaId: number,
    fechaInicio: string,
    fechaFin: string,
  ) {
    const lineas = await this.lineaRepo.find({
      where: {
        empresa_id: empresaId,
        fecha: Between(fechaInicio, fechaFin),
        estado: 1,
      },
      relations: ['cuenta_contable'],
    });

    if (lineas.length === 0) {
      throw new BadRequestException(
        'No hay movimientos en el período especificado',
      );
    }

    // Agrupar por cuenta
    const mapa = new Map<number, any>();
    let totalDebito = 0;
    let totalCredito = 0;

    for (const linea of lineas) {
      const cuentaId = linea.cuenta_contable_id;
      const debito = Number(linea.debito || 0);
      const credito = Number(linea.credito || 0);

      if (!mapa.has(cuentaId)) {
        mapa.set(cuentaId, {
          cuenta_id: cuentaId,
          codigo: linea.cuenta_contable?.codigo || '',
          nombre: linea.cuenta_contable?.nombre || '',
          debito: 0,
          credito: 0,
        });
      }

      const entry = mapa.get(cuentaId);
      entry.debito = round2(entry.debito + debito);
      entry.credito = round2(entry.credito + credito);
      totalDebito = round2(totalDebito + debito);
      totalCredito = round2(totalCredito + credito);
    }

    const cuentas = Array.from(mapa.values()).sort(
      (a, b) => Number(a.codigo) - Number(b.codigo),
    );

    return {
      periodo: `${fechaInicio} a ${fechaFin}`,
      cuentas,
      total_debito: totalDebito,
      total_credito: totalCredito,
      diferencia: round2(Math.abs(totalDebito - totalCredito)),
      balanceado: Math.abs(totalDebito - totalCredito) < 0.01,
    };
  }

  async estadoResultados(
    empresaId: number,
    fechaInicio: string,
    fechaFin: string,
  ) {
    const lineas = await this.lineaRepo.find({
      where: {
        empresa_id: empresaId,
        fecha: Between(fechaInicio, fechaFin),
        estado: 1,
      },
      relations: ['cuenta_contable'],
    });

    if (lineas.length === 0) {
      throw new BadRequestException(
        'No hay movimientos en el período especificado',
      );
    }

    // Clasificar por clase de cuenta (4=ingresos, 5=costos, 6=gastos)
    const ingresos = new Map<number, any>();
    const costos = new Map<number, any>();
    const gastos = new Map<number, any>();

    let totalIngresos = 0;
    let totalCostos = 0;
    let totalGastos = 0;

    for (const linea of lineas) {
      const cuenta = linea.cuenta_contable;
      if (!cuenta) continue;

      const clasificacion = Number(cuenta.clasificacion);
      const valor = Number(linea.credito || 0) - Number(linea.debito || 0); // Ingresos y gastos tienen naturaleza inversa

      if (clasificacion === 4) {
        // Ingresos
        if (!ingresos.has(cuenta.id)) {
          ingresos.set(cuenta.id, {
            codigo: cuenta.codigo,
            nombre: cuenta.nombre,
            valor: 0,
          });
        }
        const entry = ingresos.get(cuenta.id);
        entry.valor = round2(entry.valor + valor);
        totalIngresos = round2(totalIngresos + valor);
      } else if (clasificacion === 5) {
        // Costos
        if (!costos.has(cuenta.id)) {
          costos.set(cuenta.id, {
            codigo: cuenta.codigo,
            nombre: cuenta.nombre,
            valor: 0,
          });
        }
        const entry = costos.get(cuenta.id);
        entry.valor = round2(entry.valor + Math.abs(valor));
        totalCostos = round2(totalCostos + Math.abs(valor));
      } else if (clasificacion === 6) {
        // Gastos
        if (!gastos.has(cuenta.id)) {
          gastos.set(cuenta.id, {
            codigo: cuenta.codigo,
            nombre: cuenta.nombre,
            valor: 0,
          });
        }
        const entry = gastos.get(cuenta.id);
        entry.valor = round2(entry.valor + Math.abs(valor));
        totalGastos = round2(totalGastos + Math.abs(valor));
      }
    }

    const utilidadBruta = round2(totalIngresos - totalCostos);
    const utilidadOperacional = round2(utilidadBruta - totalGastos);

    return {
      periodo: `${fechaInicio} a ${fechaFin}`,
      ingresos: Array.from(ingresos.values()),
      total_ingresos: totalIngresos,
      costos: Array.from(costos.values()),
      total_costos: totalCostos,
      utilidad_bruta: utilidadBruta,
      gastos: Array.from(gastos.values()),
      total_gastos: totalGastos,
      utilidad_operacional: utilidadOperacional,
    };
  }

  async flujoCaja(
    empresaId: number,
    fechaInicio: string,
    fechaFin: string,
  ) {
    const lineas = await this.lineaRepo.find({
      where: {
        empresa_id: empresaId,
        fecha: Between(fechaInicio, fechaFin),
        estado: 1,
      },
      relations: ['cuenta_contable'],
    });

    if (lineas.length === 0) {
      throw new BadRequestException(
        'No hay movimientos en el período especificado',
      );
    }

    // Buscar cuentas de banco/caja (clase 1, subgrupo 1.1)
    const bancos = new Map<number, any>();
    let totalEntradas = 0;
    let totalSalidas = 0;

    for (const linea of lineas) {
      const cuenta = linea.cuenta_contable;
      if (!cuenta) continue;

      // Cuentas de banco/caja: clase 1, código que comienza con 1.1
      if (
        Number(cuenta.clasificacion) === 1 &&
        cuenta.codigo.startsWith('1.1')
      ) {
        const debito = Number(linea.debito || 0);
        const credito = Number(linea.credito || 0);

        if (!bancos.has(cuenta.id)) {
          bancos.set(cuenta.id, {
            codigo: cuenta.codigo,
            nombre: cuenta.nombre,
            entradas: 0,
            salidas: 0,
          });
        }

        const entry = bancos.get(cuenta.id);
        entry.entradas = round2(entry.entradas + debito);
        entry.salidas = round2(entry.salidas + credito);
        totalEntradas = round2(totalEntradas + debito);
        totalSalidas = round2(totalSalidas + credito);
      }
    }

    const flujoBanco = Array.from(bancos.values());
    const flujoNeto = round2(totalEntradas - totalSalidas);

    return {
      periodo: `${fechaInicio} a ${fechaFin}`,
      movimientos_banco: flujoBanco,
      total_entradas: totalEntradas,
      total_salidas: totalSalidas,
      flujo_neto: flujoNeto,
    };
  }

  async analisisCartera(
    empresaId: number,
    fechaInicio: string,
    fechaFin: string,
  ) {
    // Buscar movimientos de cuentas por cobrar (clase 1.3)
    const lineas = await this.lineaRepo.find({
      where: {
        empresa_id: empresaId,
        fecha: Between(fechaInicio, fechaFin),
        estado: 1,
      },
      relations: ['cuenta_contable', 'tercero'],
    });

    if (lineas.length === 0) {
      throw new BadRequestException(
        'No hay movimientos en el período especificado',
      );
    }

    const cartera = new Map<number, any>();
    let totalCartera = 0;

    for (const linea of lineas) {
      const cuenta = linea.cuenta_contable;
      if (!cuenta) continue;

      // Cuentas por cobrar: clase 1, código que comienza con 1.3
      if (
        Number(cuenta.clasificacion) === 1 &&
        cuenta.codigo.startsWith('1.3')
      ) {
        const terceroId = linea.tercero_id;
        const saldo = Number(linea.debito || 0) - Number(linea.credito || 0);

        if (saldo > 0) {
          if (!cartera.has(terceroId)) {
            cartera.set(terceroId, {
              tercero_id: terceroId,
              nombre_tercero: linea.tercero?.nombre || 'Desconocido',
              saldo: 0,
            });
          }

          const entry = cartera.get(terceroId);
          entry.saldo = round2(entry.saldo + saldo);
          totalCartera = round2(totalCartera + saldo);
        }
      }
    }

    const deudores = Array.from(cartera.values()).sort(
      (a, b) => b.saldo - a.saldo,
    );

    return {
      periodo: `${fechaInicio} a ${fechaFin}`,
      deudores,
      total_cartera: totalCartera,
      cantidad_deudores: deudores.length,
    };
  }
}
