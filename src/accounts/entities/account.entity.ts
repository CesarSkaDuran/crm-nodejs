import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
} from 'typeorm';
import { Company } from '../../companies/entities/company.entity';

export enum Naturaleza {
  DEBITO = 'D',
  CREDITO = 'C',
}

@Unique(['empresa_id', 'codigo'])
@Entity('plan_cuentas')
export class Account {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  empresa_id: number;

  @ManyToOne(() => Company, (empresa) => empresa.id)
  @JoinColumn({ name: 'empresa_id' })
  empresa: Company;

  @Column()
  codigo: string;

  @Column()
  nombre: string;

  @Column({ default: 4, comment: '1 clase, 2 grupo, 3 cuenta, 4 auxiliar' })
  clasificacion: number;

  @Column({ nullable: true })
  clase: string;

  @Column({ nullable: true })
  grupo: string;

  @Column({ nullable: true })
  cuenta: string;

  @Column({
    type: 'enum',
    enum: Naturaleza,
    default: Naturaleza.DEBITO,
  })
  naturaleza: Naturaleza;

  @Column({ type: 'tinyint', default: 1 })
  tipo: number;

  @Column({ nullable: true })
  axl: string;

  @Column({ nullable: true })
  cuenta_padre_id: number;

  @ManyToOne(() => Account, (cuenta) => cuenta.hijas)
  @JoinColumn({ name: 'cuenta_padre_id' })
  cuenta_padre: Account;

  @OneToMany(() => Account, (cuenta) => cuenta.cuenta_padre)
  hijas: Account[];

  @Column({ type: 'tinyint', default: 1 })
  estado: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
