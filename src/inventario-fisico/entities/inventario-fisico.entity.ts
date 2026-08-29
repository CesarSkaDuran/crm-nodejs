import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum EstadoInventario {
  PENDIENTE = 1, // En proceso de conteo
  INCOMPLETO = 2, // Consolidado, esperando ajustes
  GUARDADO = 3, // Finalizado y ajustado
  ANULADO = 0,
}

@Entity('inventarios_fisicos')
export class InventarioFisico {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  empresa_id: number;

  @Column({ comment: 'Código consecutivo (I + prefijo + número)' })
  codigo: string;

  @Column({ type: 'date' })
  fecha: string;

  @Column({ type: 'tinyint', default: 1, comment: '1=pendiente, 2=consolidado, 3=guardado, 0=anulado' })
  estado: number;

  @Column('decimal', { precision: 15, scale: 2, default: 0, comment: 'Valor total del inventario según sistema' })
  valor_sistema: number;

  @Column('decimal', { precision: 15, scale: 2, default: 0, comment: 'Valor total del inventario según conteo físico' })
  valor_conteo: number;

  @Column('decimal', { precision: 15, scale: 2, default: 0, comment: 'Diferencia valor_sistema - valor_conteo' })
  diferencia: number;

  @Column({ type: 'text', nullable: true })
  observacion: string;

  @Column({ nullable: true })
  usuario: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
