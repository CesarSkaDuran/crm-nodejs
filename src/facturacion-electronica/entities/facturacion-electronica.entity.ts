import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('facturacion_electronica')
export class FacturacionElectronica {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  empresa_id: number;

  @Column({ nullable: true })
  token: string;

  @Column({ nullable: true })
  api_url: string;

  @Column({ nullable: true })
  resolucion: string;

  @Column({ nullable: true })
  prefijo: string;

  @Column({ nullable: true })
  rango_inicio: number;

  @Column({ nullable: true })
  rango_fin: number;

  @Column({ type: 'date', nullable: true })
  fecha_resolucion: string;

  @Column({ type: 'date', nullable: true })
  fecha_vencimiento: string;

  @Column({ type: 'int', default: 0 })
  ultimo_consecutivo: number;

  @Column({ type: 'tinyint', default: 0, comment: '0=inactiva, 1=activa' })
  estado: number;

  @Column({ nullable: true })
  company_link: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
