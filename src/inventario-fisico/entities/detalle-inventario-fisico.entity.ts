import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { InventarioFisico } from './inventario-fisico.entity';

@Entity('detalle_inventario_fisico')
export class DetalleInventarioFisico {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  inventario_id: number;

  @ManyToOne(() => InventarioFisico, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'inventario_id' })
  inventario: InventarioFisico;

  @Column()
  empresa_id: number;

  @Column()
  producto_id: number;

  @Column()
  codigo_producto: string;

  @Column()
  nombre_producto: string;

  @Column('decimal', { precision: 15, scale: 2, default: 0 })
  costo_unitario: number;

  @Column('decimal', { precision: 15, scale: 2, default: 0, comment: 'Stock que muestra el sistema' })
  cantidad_sistema: number;

  @Column('decimal', { precision: 15, scale: 2, default: 0, comment: 'Cantidad contada físicamente' })
  conteo: number;

  @Column('decimal', { precision: 15, scale: 2, default: 0, comment: 'cantidad_sistema - conteo (negativo=faltante, positivo=sobrante)' })
  diferencia: number;

  @Column('decimal', { precision: 15, scale: 2, default: 0, comment: 'costo_unitario * conteo' })
  valor_conteo: number;

  @Column({ type: 'tinyint', default: 1, comment: '1=pendiente, 2=ajustado' })
  estado: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
