import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

export enum TipoOperacion {
  CREAR = 'CREATE',
  ACTUALIZAR = 'UPDATE',
  ELIMINAR = 'DELETE',
  ANULAR = 'ANULAR',
}

@Entity('auditoria')
export class Auditoria {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  empresa_id: number;

  @Column({ type: 'varchar', length: 100 })
  tabla: string; // Nombre de la tabla afectada

  @Column({ type: 'int' })
  registro_id: number; // ID del registro afectado

  @Column({ type: 'enum', enum: TipoOperacion })
  operacion: TipoOperacion;

  @Column({ type: 'varchar', length: 100 })
  usuario: string;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  fecha: Date;

  @Column({ type: 'longtext', nullable: true })
  valores_anteriores: string; // JSON con valores antes del cambio

  @Column({ type: 'longtext', nullable: true })
  valores_nuevos: string; // JSON con valores después del cambio

  @Column({ type: 'varchar', length: 255, nullable: true })
  descripcion: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  ip_origen: string;

  @Column({ type: 'int', default: 1 })
  estado: number; // 1: activo, 0: inactivo
}
