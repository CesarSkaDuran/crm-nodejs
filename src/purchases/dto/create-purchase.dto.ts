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

export class DetalleCompraDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  @Type(() => Number)
  producto_id: number;

  @ApiProperty({ example: 10 })
  @IsNumber()
  @Type(() => Number)
  cantidad: number;

  @ApiProperty({ example: 25000 })
  @IsNumber()
  @Type(() => Number)
  costo_unitario: number;

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

export class CreatePurchaseDto {
  @ApiProperty({ example: 1, description: 'Id del tercero proveedor' })
  @IsInt()
  @Type(() => Number)
  proveedor_id: number;

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
  codigo_guia_compra?: string;

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

  @ApiPropertyOptional({ example: 'Compra de mercancía' })
  @IsString()
  @IsOptional()
  observacion?: string;

  @ApiPropertyOptional({ example: 'Inventario' })
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
    description: 'Banco/caja para pago de contado',
  })
  @IsInt()
  @IsOptional()
  @Type(() => Number)
  banco_id?: number;

  @ApiProperty({ type: [DetalleCompraDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => DetalleCompraDto)
  detalles: DetalleCompraDto[];
}
