import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('empresas')
export class Company {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  codigo: string;

  @Column()
  nombre: string;

  @Column({ nullable: true })
  nit: string;

  @Column({ nullable: true })
  dv: string;

  @Column({ nullable: true })
  direccion: string;

  @Column({ nullable: true })
  telefono: string;

  @Column({ nullable: true })
  email: string;

  @Column({ nullable: true })
  ciudad: string;

  @Column({ type: 'tinyint', default: 1 })
  estado: number;

  @Column({ default: 0 })
  consecutivo_compras: number;

  @Column({ default: 0 })
  consecutivo_asientos: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
