import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';
import { TipoNaturaleza, TipoTercero } from '../entities/third.entity';

export class CreateThirdDto {
  @ApiProperty({ example: 'CL0001' })
  @IsString()
  @IsNotEmpty()
  codigo: string;

  @ApiProperty({
    example: TipoTercero.CLIENTE,
    description: '1 cliente, 2 proveedor, 3 empleado, 4 vendedor, 5 otro',
  })
  @IsInt()
  @Type(() => Number)
  tipo_terceros: number;

  @ApiPropertyOptional({
    example: TipoNaturaleza.NATURAL,
    description: '1 natural, 2 jurídica',
  })
  @IsInt()
  @IsOptional()
  @Type(() => Number)
  tipo_naturaleza?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsInt()
  @IsOptional()
  @Type(() => Number)
  regimen?: number;

  @ApiProperty({ example: 'Juan' })
  @IsString()
  @IsNotEmpty()
  nombre: string;

  @ApiPropertyOptional({ example: 'Pérez' })
  @IsString()
  @IsOptional()
  apellido?: string;

  @ApiPropertyOptional({ example: 'juan@cliente.com' })
  @IsString()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({ example: 1, description: '1 CC, 2 NIT, 3 CE, 4 PAS' })
  @IsInt()
  @IsOptional()
  @Type(() => Number)
  tipo_documento?: number;

  @ApiPropertyOptional({ example: '1090123456' })
  @IsString()
  @IsOptional()
  documento?: string;

  @ApiPropertyOptional({ example: '7' })
  @IsString()
  @IsOptional()
  dv?: string;

  @ApiPropertyOptional({ example: 'Cúcuta' })
  @IsString()
  @IsOptional()
  ciudad?: string;

  @ApiPropertyOptional({ example: 'Av. 1 # 2-3' })
  @IsString()
  @IsOptional()
  direccion?: string;

  @ApiPropertyOptional({ example: '3210000000' })
  @IsString()
  @IsOptional()
  telefono?: string;

  @ApiPropertyOptional({ example: '1990-05-20' })
  @IsDateString()
  @IsOptional()
  fecha_nacimiento?: string;

  @ApiPropertyOptional({ example: 1000000 })
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  cupo?: number;

  @ApiPropertyOptional({ example: 'RUTA-1' })
  @IsString()
  @IsOptional()
  ruta?: string;

  @ApiPropertyOptional({ example: 140 })
  @IsInt()
  @IsOptional()
  @Type(() => Number)
  cuenta_contable_id?: number;

  @ApiPropertyOptional({ example: 1, description: '1 activo, 0 inactivo' })
  @IsInt()
  @IsOptional()
  @Type(() => Number)
  estado?: number;
}
