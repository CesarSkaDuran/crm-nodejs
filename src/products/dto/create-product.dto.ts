import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateProductDto {
  @ApiProperty({ example: 'PDT0001' })
  @IsString()
  @IsNotEmpty()
  codigo: string;

  @ApiProperty({ example: 'Reloj Casio MTP-1183' })
  @IsString()
  @IsNotEmpty()
  nombre: string;

  @ApiPropertyOptional({ example: '7501234567890' })
  @IsString()
  @IsOptional()
  cod_barra?: string;

  @ApiPropertyOptional({ example: 'Reloj análogo acero inoxidable' })
  @IsString()
  @IsOptional()
  descripcion?: string;

  @ApiPropertyOptional({ example: 'PROV-A-01' })
  @IsString()
  @IsOptional()
  codigo_prov?: string;

  @ApiPropertyOptional({ example: 'MTP-1183' })
  @IsString()
  @IsOptional()
  referencia?: string;

  @ApiPropertyOptional({ example: 'UND' })
  @IsString()
  @IsOptional()
  unidad_medida?: string;

  @ApiPropertyOptional({ example: 'Relojería' })
  @IsString()
  @IsOptional()
  categoria?: string;

  @ApiPropertyOptional({ example: 'Relojes hombre' })
  @IsString()
  @IsOptional()
  grupo?: string;

  @ApiPropertyOptional({ example: 0.25 })
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  peso?: number;

  @ApiPropertyOptional({ example: 1, description: '1 producto, 2 servicio' })
  @IsInt()
  @IsOptional()
  @Type(() => Number)
  tipo?: number;

  @ApiPropertyOptional({ example: 5 })
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  stock_min?: number;

  @ApiPropertyOptional({ example: 120000 })
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  pvp1?: number;

  @ApiPropertyOptional({ example: 115000 })
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  pvp2?: number;

  @ApiPropertyOptional({ example: 110000 })
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  pvp3?: number;

  @ApiPropertyOptional({ example: 0 })
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  flete?: number;

  @ApiPropertyOptional({ example: 0 })
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  descuento?: number;

  @ApiPropertyOptional({ example: 0 })
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  comision?: number;

  @ApiPropertyOptional({ example: 19 })
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  impuesto?: number;

  @ApiPropertyOptional({ example: 10 })
  @IsInt()
  @IsOptional()
  @Type(() => Number)
  cuenta_inventarios_id?: number;

  @ApiPropertyOptional({ example: 11 })
  @IsInt()
  @IsOptional()
  @Type(() => Number)
  cuenta_costos_id?: number;

  @ApiPropertyOptional({ example: 12 })
  @IsInt()
  @IsOptional()
  @Type(() => Number)
  cuenta_ingresos_id?: number;

  @ApiPropertyOptional({ example: 'productos/reloj.jpg' })
  @IsString()
  @IsOptional()
  imagen1?: string;

  @ApiPropertyOptional({ example: null })
  @IsString()
  @IsOptional()
  imagen2?: string;

  @ApiPropertyOptional({ example: 1, description: '1 activo, 0 inactivo' })
  @IsInt()
  @IsOptional()
  @Type(() => Number)
  estado?: number;
}
