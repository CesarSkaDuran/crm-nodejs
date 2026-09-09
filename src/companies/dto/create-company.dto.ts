import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateCompanyDto {
  @ApiProperty({ example: 'DEMO' })
  @IsString()
  @IsNotEmpty()
  codigo: string;

  @ApiProperty({ example: 'Empresa Demo S.A.S.' })
  @IsString()
  @IsNotEmpty()
  nombre: string;

  @ApiPropertyOptional({ example: '900000000' })
  @IsString()
  @IsOptional()
  nit?: string;

  @ApiPropertyOptional({ example: '7' })
  @IsString()
  @IsOptional()
  dv?: string;

  @ApiPropertyOptional({ example: 'Av. 1 # 2-3' })
  @IsString()
  @IsOptional()
  direccion?: string;

  @ApiPropertyOptional({ example: '3210000000' })
  @IsString()
  @IsOptional()
  telefono?: string;

  @ApiPropertyOptional({ example: 'contacto@demo.com' })
  @IsString()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({ example: 'Cúcuta' })
  @IsString()
  @IsOptional()
  ciudad?: string;

  @ApiPropertyOptional({ example: 'Colombia' })
  @IsString()
  @IsOptional()
  pais?: string;

  @ApiPropertyOptional({ example: 'Responsable de IVA' })
  @IsString()
  @IsOptional()
  regimen?: string;

  @ApiPropertyOptional({ example: 'IVA, Retención en la fuente, ICA' })
  @IsString()
  @IsOptional()
  obligaciones?: string;

  @ApiPropertyOptional({ example: '/uploads/empresas/logo-1.png' })
  @IsString()
  @IsOptional()
  logo?: string;

  @ApiPropertyOptional({ example: '#1e40af' })
  @IsString()
  @IsOptional()
  color_primario?: string;

  @ApiPropertyOptional({ example: '#f8fafc' })
  @IsString()
  @IsOptional()
  color_secundario?: string;

  @ApiPropertyOptional({ example: 1, description: 'ID de la moneda por defecto de la empresa' })
  @IsInt()
  @IsOptional()
  @Type(() => Number)
  moneda_id?: number;

  @ApiPropertyOptional({ example: 1, description: '1 activo, 0 inactivo' })
  @IsInt()
  @IsOptional()
  @Type(() => Number)
  estado?: number;
}
