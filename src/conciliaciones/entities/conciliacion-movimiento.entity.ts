import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('conciliaciones_movimientos')
@Index('idx_conc_mov_empresa', ['empresa_id'])
@Index('idx_conc_mov_conciliacion', ['conciliacion_id'])
export class ConciliacionMovimiento {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  empresa_id: number;

  @Column()
  conciliacion_id: number;

  /**
   * Origen del movimiento:
   * - 'libro'   = está en libros pero no en extracto (cheque no cobrado, consignación pendiente)
   * - 'extracto' = está en extracto pero no en libros (comisión bancaria, interés)
   */
  @Column({ type: 'varchar', length: 10 })
  origen: string;

  /** 1 = ingreso (suma al banco), 2 = egreso (resta al banco) */
  @Column({ type: 'tinyint' })
  tipo_movimiento: number;

  @Column({ type: 'date' })
  fecha: string;

  @Column({ length: 255 })
  descripcion: string;

  @Column('decimal', { precision: 15, scale: 2 })
  valor: number;

  /** Referencia al movimiento de tesorería si aplica (origen='libro') */
  @Column({ nullable: true })
  tesoreria_id: number;

  /** Código DIAN de la forma de pago (ej. 20=cheque, 42=consignación) */
  @Column({ type: 'tinyint', nullable: true, comment: 'forma de pago (código DIAN)' })
  forma: number;

  /**
   * Concepto contable estándar de conciliación:
   * - 'nota_debito'         = ND bancaria: está en extracto, falta en libros (comisión, GMF)
   * - 'nota_credito'        = NC bancaria: está en extracto, falta en libros (intereses, abono)
   * - 'cheque_circulacion'  = cheque girado no cobrado (libro egreso, no en extracto)
   * - 'consignacion_transito' = consignación en tránsito (libro ingreso, no en extracto)
   * - 'error_libros'        = partida mal registrada en libros
   * - 'error_extracto'      = partida errada del banco en extracto
   */
  @Column({ type: 'varchar', length: 30, nullable: true })
  concepto: string;

  /** Cuenta PUC de contrapartida (obligatoria para notas débito/crédito) */
  @Column({ nullable: true })
  cuenta_contable_id: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
