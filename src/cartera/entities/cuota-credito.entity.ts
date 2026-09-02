import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Credito } from './credito.entity';

export enum EstadoCuota {
  PENDIENTE = 1, // No ha sido pagada
  PAGADA = 2, // Pagada completamente
  PARCIAL = 3, // Abonada pero no completada
}

@Entity('cuotas_credito')
export class CuotaCredito {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  empresa_id: number;

  @Column()
  credito_id: number;

  @ManyToOne(() => Credito, (credito) => credito.cuotas)
  @JoinColumn({ name: 'credito_id' })
  credito: Credito;

  @Column({ type: 'int' })
  numero_cuota: number;

  @Column('decimal', { precision: 15, scale: 2, default: 0 })
  valor: number;

  @Column('decimal', { precision: 15, scale: 2, default: 0, comment: 'Monto ya abonado a esta cuota' })
  abonado: number;

  @Column('decimal', { precision: 15, scale: 2, default: 0, comment: 'Saldo pendiente de esta cuota' })
  saldo: number;

  @Column({ type: 'date' })
  fecha_pago_oportuno: string;

  @Column({ type: 'date', nullable: true })
  fecha_pago_efectivo: string;

  @Column({ type: 'date', nullable: true, comment: 'Fecha posfechada acordada con el cliente' })
  fecha_posfechada: string;

  @Column('decimal', {
    precision: 15,
    scale: 2,
    default: 0,
    comment: 'Interés moratorio acumulado persistente (no se suma al saldo)',
  })
  interes_acumulado: number;

  @Column({
    type: 'date',
    nullable: true,
    comment: 'Fecha hasta la cual se ha calculado el interés acumulado',
  })
  fecha_ultimo_calculo_interes: string;

  @Column({ nullable: true })
  numero_recibo: string;

  @Column({ nullable: true })
  banco_id: number;

  @Column({ nullable: true })
  asentado_id: number;

  @Column({ type: 'tinyint', default: 1, comment: '1=pendiente, 2=pagada, 3=parcial' })
  estado: number;

  @Column({ type: 'text', nullable: true })
  observacion: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
