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

  @Column({ type: 'tinyint', default: 1 })
  estado: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
