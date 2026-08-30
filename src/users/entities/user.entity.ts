import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
} from 'typeorm';
import { Company } from '../../companies/entities/company.entity';

export enum UserRole {
  ADMIN = 'admin',
  CONTADOR = 'contador',
  VENDEDOR = 'vendedor',
  CONSULTA = 'consulta',
}

@Unique(['email', 'empresa_id'])
@Entity('usuarios')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  empresa_id: number;

  @ManyToOne(() => Company, (empresa) => empresa.id)
  @JoinColumn({ name: 'empresa_id' })
  empresa: Company;

  @Column()
  nombre: string;

  @Column({ nullable: true })
  apellido: string;

  @Column({ unique: true })
  usuario: string;

  @Column()
  email: string;

  @Column({ select: false })
  password: string;

  @Column({
    type: 'enum',
    enum: UserRole,
    default: UserRole.CONSULTA,
  })
  rol: UserRole;

  @Column({ type: 'tinyint', default: 1 })
  estado: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
