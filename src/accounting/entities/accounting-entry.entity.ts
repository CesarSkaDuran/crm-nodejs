import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Account } from '../../accounts/entities/account.entity';
import { Third } from '../../thirds/entities/third.entity';

@Entity('asentados')
export class AccountingEntry {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  empresa_id: number;

  @Column()
  consecutivo: string;

  @Column({
    type: 'tinyint',
    comment: '1 compra, 2 venta, 3 egreso, 4 ingreso, 5 ajuste',
  })
  tipo: number;

  @Column({ type: 'date' })
  fecha: string;

  @Column({ type: 'text', nullable: true })
  descripcion: string;

  @Column('decimal', { precision: 15, scale: 2, default: 0 })
  total_debito: number;

  @Column('decimal', { precision: 15, scale: 2, default: 0 })
  total_credito: number;

  @Column({ nullable: true })
  usuario: string;

  @Column({ type: 'tinyint', default: 1 })
  estado: number;

  @OneToMany(() => AccountingEntryLine, (detalle) => detalle.asentado, {
    cascade: true,
  })
  detalles: AccountingEntryLine[];

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}

@Entity('contabilidad')
export class AccountingEntryLine {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  empresa_id: number;

  @Column()
  asentado_id: number;

  @ManyToOne(() => AccountingEntry, (asentado) => asentado.detalles)
  @JoinColumn({ name: 'asentado_id' })
  asentado: AccountingEntry;

  @Column()
  cuenta_contable_id: number;

  @ManyToOne(() => Account, (cuenta) => cuenta.id)
  @JoinColumn({ name: 'cuenta_contable_id' })
  cuenta_contable: Account;

  @Column({ nullable: true })
  tercero_id: number;

  @ManyToOne(() => Third, (tercero) => tercero.id)
  @JoinColumn({ name: 'tercero_id' })
  tercero: Third;

  @Column({ type: 'text', nullable: true })
  descripcion: string;

  @Column('decimal', { precision: 15, scale: 2, default: 0 })
  valor: number;

  @Column('decimal', { precision: 15, scale: 2, default: 0 })
  debito: number;

  @Column('decimal', { precision: 15, scale: 2, default: 0 })
  credito: number;

  @Column({ nullable: true })
  naturaleza: string;

  @Column()
  consecutivo: string;

  @Column({ type: 'date' })
  fecha: string;

  @Column({ nullable: true })
  usuario: string;

  @Column({ type: 'tinyint', default: 1 })
  estado: number;

  @CreateDateColumn()
  created_at: Date;
}
