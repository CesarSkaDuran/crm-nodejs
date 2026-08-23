import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('bancos')
export class Banco {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  empresa_id: number;

  @Column()
  nombre: string;

  @Column('decimal', { precision: 15, scale: 2, default: 0 })
  monto: number;

  @Column('decimal', { precision: 15, scale: 2, default: 0 })
  monto_dia: number;

  @Column({ type: 'tinyint', default: 1 })
  tipo: number;

  @Column({ nullable: true })
  cuenta_id: string;

  @Column({ type: 'tinyint', default: 1 })
  estado: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
