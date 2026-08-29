import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Company } from '../../companies/entities/company.entity';
import { Third } from '../../thirds/entities/third.entity';
import { CuotaCredito } from './cuota-credito.entity';

export enum TipoCredito {
  VENTA = 1, // Cartera por cobrar (clientes)
  COMPRA = 2, // Cartera por pagar (proveedores)
  MANUAL = 3, // Crédito creado manualmente
}

export enum PeriodoCredito {
  SEMANAL = 1,
  QUINCENAL = 2,
  MENSUAL = 3,
}

export enum EstadoCredito {
  ACTIVO = 1, // Con cuotas pendientes
  PAGADO = 2, // Saldo en cero
  ANULADO = 0,
}

@Entity('creditos')
export class Credito {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  empresa_id: number;

  @ManyToOne(() => Company, (empresa) => empresa.id)
  @JoinColumn({ name: 'empresa_id' })
  empresa: Company;

  @Column()
  tercero_id: number;

  @ManyToOne(() => Third, (tercero) => tercero.id)
  @JoinColumn({ name: 'tercero_id' })
  tercero: Third;

  @Column({ nullable: true })
  documento_origen: string;

  @Column({ type: 'tinyint', comment: '1=venta, 2=compra, 3=manual' })
  tipo_credito: number;

  @Column({ type: 'date' })
  fecha: string;

  @Column('decimal', { precision: 15, scale: 2, default: 0 })
  monto_total: number;

  @Column('decimal', { precision: 15, scale: 2, default: 0 })
  saldo: number;

  @Column('decimal', { precision: 15, scale: 2, default: 0 })
  valor_cuota: number;

  @Column({ type: 'int', default: 1 })
  numero_cuotas: number;

  @Column({ type: 'int', default: 0 })
  cuotas_pagadas: number;

  @Column({ type: 'tinyint', comment: '1=semanal, 2=quincenal, 3=mensual' })
  periodo: number;

  @Column('decimal', { precision: 15, scale: 2, default: 0 })
  mora: number;

  @Column('decimal', { precision: 15, scale: 2, default: 0, comment: 'Tasa de interés por mora (%) configurada por empresa' })
  tasa_mora: number;

  @Column({ type: 'date', nullable: true })
  fecha_ultimo_pago: string;

  @Column({ type: 'tinyint', default: 1, comment: '1=activo, 2=pagado, 0=anulado' })
  estado: number;

  @Column({ type: 'text', nullable: true })
  observacion: string;

  @OneToMany(() => CuotaCredito, (cuota) => cuota.credito, {
    cascade: true,
  })
  cuotas: CuotaCredito[];

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
