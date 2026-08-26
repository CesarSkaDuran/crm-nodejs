import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('tesoreria')
export class Tesoreria {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  empresa_id: number;

  @Column({ type: 'date' })
  fecha: string;

  @Column()
  codigo: string;

  @Column({ nullable: true })
  nombre_tercero: string;

  @Column('decimal', { precision: 15, scale: 2, default: 0 })
  valor: number;

  @Column({ nullable: true })
  cuenta_contable_id: string;

  @Column({ nullable: true })
  tercero: string;

  /** 1 = ingreso (entrada de dinero), 2 = egreso (salida de dinero) */
  @Column({ type: 'tinyint', default: 1 })
  tipo: number;

  /** Id del banco/caja afectado */
  @Column({ nullable: true })
  banco_id: number;

  /** Id de la cuenta contable de contrapartida (PUC) */
  @Column({ nullable: true })
  cuenta_contrapartida_id: number;

  /** Id del asiento contable generado */
  @Column({ nullable: true })
  asentado_id: number;

  @Column({ type: 'tinyint', default: 1 })
  estado: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
