import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('conciliaciones_bancarias')
@Index('idx_conciliacion_empresa_banco', ['empresa_id', 'banco_id', 'periodo'])
export class ConciliacionBancaria {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  empresa_id: number;

  @Column()
  banco_id: number;

  /** Periodo en formato YYYY-MM (ej. 2026-09) */
  @Column({ length: 7 })
  periodo: string;

  @Column({ type: 'date' })
  fecha_inicio: string;

  @Column({ type: 'date' })
  fecha_fin: string;

  /** Saldo inicial según libros (banco.monto al inicio del periodo) */
  @Column('decimal', { precision: 15, scale: 2, default: 0 })
  saldo_inicial_libros: number;

  /** Saldo final según libros (calculado al conciliar) */
  @Column('decimal', { precision: 15, scale: 2, default: 0 })
  saldo_final_libros: number;

  /** Saldo según extracto bancario (ingresado por el usuario) */
  @Column('decimal', { precision: 15, scale: 2, default: 0 })
  saldo_extracto: number;

  /** Diferencia entre saldo libros y extracto ajustado */
  @Column('decimal', { precision: 15, scale: 2, default: 0 })
  diferencia: number;

  /** 0 = borrador, 1 = conciliado, 2 = anulado */
  @Column({ type: 'tinyint', default: 0, comment: '0=borrador, 1=conciliado, 2=anulado' })
  estado: number;

  @Column({ type: 'text', nullable: true })
  notas: string;

  @Column({ nullable: true })
  usuario: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
