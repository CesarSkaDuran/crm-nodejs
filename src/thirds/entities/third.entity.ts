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
import { Account } from '../../accounts/entities/account.entity';

export enum TipoTercero {
  CLIENTE = 1,
  PROVEEDOR = 2,
  EMPLEADO = 3,
  VENDEDOR = 4,
  OTRO = 5,
}

export enum TipoNaturaleza {
  NATURAL = 1,
  JURIDICA = 2,
}

@Unique(['empresa_id', 'codigo'])
@Entity('terceros')
export class Third {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  empresa_id: number;

  @ManyToOne(() => Company, (empresa) => empresa.id)
  @JoinColumn({ name: 'empresa_id' })
  empresa: Company;

  @Column()
  codigo: string;

  @Column({ type: 'tinyint', default: TipoTercero.CLIENTE })
  tipo_terceros: number;

  @Column({ type: 'tinyint', default: TipoNaturaleza.NATURAL })
  tipo_naturaleza: number;

  @Column({ type: 'tinyint', nullable: true })
  regimen: number;

  @Column()
  nombre: string;

  @Column({ nullable: true })
  apellido: string;

  @Column({ nullable: true })
  email: string;

  @Column({ type: 'tinyint', nullable: true })
  tipo_documento: number;

  @Column({ nullable: true })
  documento: string;

  @Column({ nullable: true })
  dv: string;

  @Column({ nullable: true })
  ciudad: string;

  @Column({ type: 'text', nullable: true })
  direccion: string;

  @Column({ nullable: true })
  telefono: string;

  @Column({ type: 'date', nullable: true })
  fecha_nacimiento: string;

  @Column('decimal', { precision: 15, scale: 2, default: 0 })
  cupo: number;

  @Column({ nullable: true })
  ruta: string;

  @Column({ nullable: true })
  cuenta_contable_id: number;

  @ManyToOne(() => Account, (cuenta) => cuenta.id)
  @JoinColumn({ name: 'cuenta_contable_id' })
  cuenta_contable: Account;

  @Column({ type: 'tinyint', default: 1 })
  estado: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
