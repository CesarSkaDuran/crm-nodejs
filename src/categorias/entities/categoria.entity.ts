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

@Unique(['empresa_id', 'nombre'])
@Entity('categorias')
export class Categoria {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  empresa_id: number;

  @ManyToOne(() => Company, (empresa) => empresa.id)
  @JoinColumn({ name: 'empresa_id' })
  empresa: Company;

  @Column({ length: 150 })
  nombre: string;

  @Column({ type: 'text', nullable: true })
  descripcion: string;

  @Column({ type: 'tinyint', default: 1, comment: '1 producto, 2 servicio' })
  tipo: number;

  @Column({ nullable: true, comment: 'ID de la categoría padre (NULL = es raíz)' })
  padre_id: number;

  @ManyToOne(() => Categoria, (padre) => padre.hijos, { nullable: true })
  @JoinColumn({ name: 'padre_id' })
  padre: Categoria;

  @OneToMany('Categoria', 'padre')
  hijos: Categoria[];

  @Column({ type: 'tinyint', default: 1 })
  estado: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
