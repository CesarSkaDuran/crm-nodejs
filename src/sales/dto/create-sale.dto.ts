import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class DetalleVentaDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  @Type(() => Number)
  producto_id: number;

  @ApiProperty({ example: 10 })
  @IsNumber()
  @Type(() => Number)
  cantidad: number;

  @ApiProperty({ example: 45000 })
  @IsNumber()
  @Type(() => Number)
  precio_unitario: number;

  @ApiPropertyOptional({ example: 0 })
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  descuento?: number;

  @ApiPropertyOptional({ example: 0 })
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  impuesto?: number;

  @ApiPropertyOptional({ example: null })
  @IsString()
  @IsOptional()
  codigos?: string;
}

export class CreateSaleDto {
  @ApiProperty({ example: 1, description: 'Id del tercero cliente' })
  @IsInt()
  @Type(() => Number)
  cliente_id: number;

  @ApiProperty({ example: '2026-01-15' })
  @IsDateString()
  fecha: string;

  @ApiPropertyOptional({ example: 'FV-001-0001' })
  @IsString()
  @IsOptional()
  numero_factura?: string;

  @ApiPropertyOptional({ example: 'GUIA-001' })
  @IsString()
  @IsOptional()
  codigo_guia_venta?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsInt()
  @IsOptional()
  @Type(() => Number)
  vendedor_id?: number;

  @ApiPropertyOptional({ example: 0 })
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  descuento?: number;

  @ApiPropertyOptional({ example: 0 })
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  retencion?: number;

  @ApiPropertyOptional({ example: 0 })
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  flete?: number;

  @ApiPropertyOptional({ example: 'Venta de mercancía' })
  @IsString()
  @IsOptional()
  observacion?: string;

  @ApiPropertyOptional({ example: 'Ventas' })
  @IsString()
  @IsOptional()
  concepto?: string;

  @ApiPropertyOptional({ example: 'PRINCIPAL' })
  @IsString()
  @IsOptional()
  almacen?: string;

  @ApiPropertyOptional({ example: 1, description: '1 contado, 2 crédito' })
  @IsInt()
  @IsOptional()
  @Type(() => Number)
  modo?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsInt()
  @IsOptional()
  @Type(() => Number)
  forma?: number;

  @ApiPropertyOptional({
    example: 1,
    description: 'Id del banco/caja para ventas de contado. Si se omite, se asume a crédito.',
  })
  @IsInt()
  @IsOptional()
  @Type(() => Number)
  banco_id?: number;

  @ApiPropertyOptional({ example: 1, description: 'Número de cuotas si la venta es a crédito (default: 1)' })
  @IsInt()
  @IsOptional()
  @Type(() => Number)
  numero_cuotas?: number;

  @ApiPropertyOptional({ example: 3, description: 'Periodo de cuotas: 1=semanal, 2=quincenal, 3=mensual (default: 3)' })
  @IsInt()
  @IsOptional()
  @Type(() => Number)
  periodo_cuotas?: number;

  @ApiPropertyOptional({ example: 0, description: 'Tasa de interés por mora (%) para el crédito' })
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  tasa_mora?: number;

  @ApiProperty({ type: [DetalleVentaDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => DetalleVentaDto)
  detalles: DetalleVentaDto[];
}
