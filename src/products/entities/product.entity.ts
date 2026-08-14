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

@Unique(['empresa_id', 'codigo'])
@Entity('productos')
export class Product {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  empresa_id: number;

  @ManyToOne(() => Company, (empresa) => empresa.id)
  @JoinColumn({ name: 'empresa_id' })
  empresa: Company;

  @Column()
  codigo: string;

  @Column({ nullable: true })
  cod_barra: string;

  @Column()
  nombre: string;

  @Column({ type: 'text', nullable: true })
  descripcion: string;

  @Column({ nullable: true })
  codigo_prov: string;

  @Column({ nullable: true })
  referencia: string;

  @Column({ nullable: true })
  unidad_medida: string;

  @Column({ nullable: true })
  categoria: string;

  @Column({ nullable: true })
  grupo: string;

  @Column('decimal', { precision: 15, scale: 3, default: 0 })
  peso: number;

  @Column({ type: 'tinyint', default: 1, comment: '1 producto, 2 servicio' })
  tipo: number;

  @Column('decimal', { precision: 15, scale: 2, default: 0 })
  stock_min: number;

  @Column('decimal', { precision: 15, scale: 2, default: 0 })
  stock: number;

  @Column('decimal', { precision: 15, scale: 4, default: 0 })
  promedio: number;

  @Column('decimal', { precision: 15, scale: 2, default: 0 })
  ultimo_precio: number;

  @Column('decimal', { precision: 15, scale: 2, default: 0 })
  pvp1: number;

  @Column('decimal', { precision: 15, scale: 2, default: 0 })
  pvp2: number;

  @Column('decimal', { precision: 15, scale: 2, default: 0 })
  pvp3: number;

  @Column('decimal', { precision: 15, scale: 2, default: 0 })
  flete: number;

  @Column('decimal', { precision: 5, scale: 2, default: 0 })
  descuento: number;

  @Column('decimal', { precision: 5, scale: 2, default: 0 })
  comision: number;

  @Column('decimal', { precision: 5, scale: 2, default: 0 })
  impuesto: number;

  @Column({ nullable: true })
  cuenta_inventarios_id: number;

  @ManyToOne(() => Account, (cuenta) => cuenta.id)
  @JoinColumn({ name: 'cuenta_inventarios_id' })
  cuenta_inventarios: Account;

  @Column({ nullable: true })
  cuenta_costos_id: number;

  @ManyToOne(() => Account, (cuenta) => cuenta.id)
  @JoinColumn({ name: 'cuenta_costos_id' })
  cuenta_costos: Account;

  @Column({ nullable: true })
  cuenta_ingresos_id: number;

  @ManyToOne(() => Account, (cuenta) => cuenta.id)
  @JoinColumn({ name: 'cuenta_ingresos_id' })
  cuenta_ingresos: Account;

  @Column({ nullable: true })
  imagen1: string;

  @Column({ nullable: true })
  imagen2: string;

  @Column({ type: 'tinyint', default: 1 })
  estado: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
