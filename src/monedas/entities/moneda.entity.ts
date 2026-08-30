import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('monedas')
export class Moneda {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  empresa_id: number;

  @Column({ unique: true, length: 3 })
  codigo: string;

  @Column()
  nombre: string;

  @Column({ length: 10 })
  simbolo: string;

  @Column({ type: 'decimal', precision: 20, scale: 8, default: 1 })
  tasa: number;

  @Column({ type: 'tinyint', default: 0 })
  es_local: number;

  @Column({ type: 'tinyint', default: 1 })
  estado: number;

  @Column({ default: 0 })
  orden: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
