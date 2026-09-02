import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Maestro de periodos de pago para créditos (cartera y cuentas por pagar).
 * Cada empresa puede configurar sus propios periodos (semanal, quincenal, mensual, etc.)
 * con el número de días correspondiente.
 */
@Entity('periodos_pago')
export class PeriodoPago {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  empresa_id: number;

  @Column()
  nombre: string;

  /** Número de días entre cuotas */
  @Column({ type: 'int' })
  dias: number;

  /** Orden de visualización */
  @Column({ type: 'int', default: 0 })
  orden: number;

  @Column({ type: 'tinyint', default: 1 })
  estado: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
