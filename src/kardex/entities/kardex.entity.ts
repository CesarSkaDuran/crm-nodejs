import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { Product } from '../../products/entities/product.entity';

@Entity('kardex')
export class Kardex {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  empresa_id: number;

  @Column()
  producto_id: number;

  @ManyToOne(() => Product, (producto) => producto.id)
  @JoinColumn({ name: 'producto_id' })
  producto: Product;

  @Column({ comment: 'compra, venta, ajuste' })
  tipo_documento: string;

  @Column({ nullable: true })
  documento_id: number;

  @Column()
  consecutivo: string;

  @Column({ type: 'date' })
  fecha: string;

  @Column('decimal', { precision: 15, scale: 2, default: 0 })
  cantidad_anterior: number;

  @Column('decimal', { precision: 15, scale: 2, default: 0 })
  saldo_anterior: number;

  @Column('decimal', { precision: 15, scale: 4, default: 0 })
  promedio_anterior: number;

  @Column('decimal', { precision: 15, scale: 4, default: 0 })
  valor_unitario: number;

  @Column('decimal', { precision: 15, scale: 2, default: 0 })
  entradas: number;

  @Column('decimal', { precision: 15, scale: 2, default: 0 })
  salidas: number;

  @Column('decimal', { precision: 15, scale: 2, default: 0 })
  valor_entradas: number;

  @Column('decimal', { precision: 15, scale: 2, default: 0 })
  valor_salidas: number;

  @Column('decimal', { precision: 15, scale: 2, default: 0 })
  total: number;

  @Column('decimal', { precision: 15, scale: 2, default: 0 })
  cantidad_actual: number;

  @Column('decimal', { precision: 15, scale: 2, default: 0 })
  saldo_actual: number;

  @Column('decimal', { precision: 15, scale: 4, default: 0 })
  promedio_actual: number;

  @Column('decimal', { precision: 15, scale: 4, default: 0, nullable: true })
  precio_venta: number;

  @Column({ type: 'tinyint', default: 1 })
  estado: number;

  @CreateDateColumn()
  created_at: Date;
}
