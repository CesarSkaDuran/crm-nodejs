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
import { Company } from '../../companies/entities/company.entity';
import { Third } from '../../thirds/entities/third.entity';
import { SaleDetail } from './sale-detail.entity';

@Entity('ventas')
export class Sale {
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
  numero_factura: string;

  @Column({ type: 'date' })
  fecha: string;

  @Column()
  cliente_id: number;

  @ManyToOne(() => Third, (tercero) => tercero.id)
  @JoinColumn({ name: 'cliente_id' })
  cliente: Third;

  @Column({ nullable: true })
  vendedor_id: number;

  @Column({ nullable: true })
  codigo_guia_venta: string;

  @Column('decimal', { precision: 15, scale: 2, default: 0 })
  base_grava: number;

  @Column('decimal', { precision: 15, scale: 2, default: 0 })
  descuento: number;

  @Column('decimal', { precision: 15, scale: 2, default: 0 })
  impuesto: number;

  @Column('decimal', { precision: 15, scale: 2, default: 0 })
  retencion: number;

  @Column('decimal', { precision: 15, scale: 2, default: 0 })
  flete: number;

  @Column('decimal', { precision: 15, scale: 2, default: 0 })
  total: number;

  @Column({ type: 'text', nullable: true })
  observacion: string;

  @Column({ nullable: true })
  concepto: string;

  @Column({ nullable: true })
  almacen: string;

  @Column({ type: 'tinyint', default: 1, comment: '1 contado, 2 crédito' })
  modo: number;

  @Column({ type: 'tinyint', nullable: true, comment: 'forma de pago' })
  forma: number;

  @Column({ type: 'tinyint', default: 1, comment: '1 asentada, 0 anulada' })
  estado: number;

  @Column({ nullable: true, comment: 'FK a monedas (COP por defecto)' })
  moneda_id: number;

  @Column({ length: 3, default: 'COP' })
  moneda_codigo: string;

  @Column('decimal', { precision: 15, scale: 2, default: 0, comment: 'Total en la moneda original (ej. USD)' })
  valor_moneda_extranjera: number;

  @Column('decimal', { precision: 20, scale: 8, default: 1, comment: 'TRM del día del documento' })
  tasa_cambio: number;

  @Column('decimal', { precision: 15, scale: 2, default: 0, comment: 'Total equivalente en COP' })
  valor_cop: number;

  @OneToMany(() => SaleDetail, (detalle) => detalle.venta)
  detalles: SaleDetail[];

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
