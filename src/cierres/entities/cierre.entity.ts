import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Company } from '../../companies/entities/company.entity';

export enum EstadoCierre {
  ABIERTO = 0,
  CERRADO = 1,
  ANULADO = 2,
}

@Entity('cierres')
export class Cierre {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  empresa_id: number;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'empresa_id' })
  empresa: Company;

  @Column({ type: 'varchar', length: 10 })
  periodo: string; // YYYY-MM

  @Column({ type: 'date' })
  fecha_inicio: string;

  @Column({ type: 'date' })
  fecha_fin: string;

  @Column({ type: 'date' })
  fecha_cierre: string; // Fecha en que se ejecutó el cierre

  @Column({ type: 'enum', enum: EstadoCierre, default: EstadoCierre.ABIERTO })
  estado: EstadoCierre;

  // Validaciones previas al cierre
  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  saldo_inicial_kardex: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  saldo_final_kardex: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0 })
  diferencia_kardex: number; // Debe ser 0 para cerrar

  @Column({ type: 'int', default: 0 })
  total_movimientos: number; // Cantidad de movimientos en el período

  @Column({ type: 'int', default: 0 })
  total_asientos: number; // Cantidad de asientos contables

  // Asientos de cierre generados
  @Column({ type: 'int', nullable: true })
  asentado_cierre_id: number; // ID del asiento de cierre

  @Column({ type: 'varchar', length: 255, nullable: true })
  descripcion: string;

  @Column({ type: 'varchar', length: 100 })
  usuario: string;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  fecha_creacion: Date;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
  fecha_actualizacion: Date;

  @Column({ type: 'int', default: 1 })
  estado_registro: number; // 1: activo, 0: inactivo
}
