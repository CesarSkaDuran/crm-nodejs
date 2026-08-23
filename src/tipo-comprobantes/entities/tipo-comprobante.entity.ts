import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('tipo_comprobantes')
export class TipoComprobante {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  empresa_id: number;

  @Column()
  nombre: string;

  @Column({ nullable: true })
  simple: string;

  @Column({ nullable: true })
  prefijo: string;

  @Column({ default: 1 })
  consecutivo: number;

  @Column({ type: 'tinyint', default: 1 })
  tipo: number;

  @Column({ type: 'tinyint', default: 1 })
  estado: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
