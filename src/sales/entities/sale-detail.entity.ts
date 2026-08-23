import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { Product } from '../../products/entities/product.entity';
import { Sale } from './sale.entity';

@Entity('detalle_ventas')
export class SaleDetail {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  venta_id: number;

  @ManyToOne(() => Sale, (venta) => venta.detalles)
  @JoinColumn({ name: 'venta_id' })
  venta: Sale;

  @Column()
  producto_id: number;

  @ManyToOne(() => Product, (producto) => producto.id)
  @JoinColumn({ name: 'producto_id' })
  producto: Product;

  @Column('decimal', { precision: 15, scale: 2 })
  cantidad: number;

  @Column('decimal', { precision: 15, scale: 4 })
  precio_unitario: number;

  @Column('decimal', { precision: 15, scale: 4 })
  costo_unitario: number;

  @Column('decimal', { precision: 5, scale: 2, default: 0 })
  descuento: number;

  @Column('decimal', { precision: 5, scale: 2, default: 0 })
  impuesto: number;

  @Column('decimal', { precision: 15, scale: 2 })
  subtotal: number;

  @Column({ type: 'text', nullable: true })
  codigos: string;

  @Column({ type: 'tinyint', default: 1 })
  estado: number;

  @CreateDateColumn()
  created_at: Date;
}
