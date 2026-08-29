import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateCategoriaDto {
  @ApiProperty({ example: 'Papelería' })
  @IsString()
  @IsNotEmpty()
  nombre: string;

  @ApiPropertyOptional({ example: 'Artículos de papelería y oficina' })
  @IsString()
  @IsOptional()
  descripcion?: string;

  @ApiProperty({ example: 1, description: '1 producto, 2 servicio' })
  @IsInt()
  tipo: number;

  @ApiPropertyOptional({ example: null, description: 'ID de la categoría padre. NULL = categoría raíz' })
  @IsInt()
  @IsOptional()
  padre_id?: number;
}
