import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('historial_tasas')
export class HistorialTasa {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  empresa_id: number;

  @Column()
  moneda_id: number;

  @Column({ length: 3 })
  codigo_moneda: string;

  @Column('decimal', { precision: 20, scale: 8 })
  tasa: number;

  @Index()
  @Column({ type: 'date' })
  fecha_vigencia: string;

  @Column({ default: 'trm_oficial', comment: 'trm_oficial | fallback | manual' })
  fuente: string;

  @CreateDateColumn()
  created_at: Date;
}
