import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsInt, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Query params para el Libro por Terceros (movimientos de un tercero en una cuenta).
 *
 * Endpoint: GET /api/v1/informes/terceros
 */
export class LibroTercerosDto {
  @ApiPropertyOptional({ example: 1001, description: 'ID de la cuenta contable' })
  @Type(() => Number)
  @IsInt()
  @IsOptional()
  cuenta_id?: number;

  @ApiPropertyOptional({ example: 5, description: 'ID del tercero' })
  @Type(() => Number)
  @IsInt()
  @IsOptional()
  tercero_id?: number;

  @ApiPropertyOptional({
    example: 'detallado',
    enum: ['detallado', 'resumido', 'porComprobante', 'discriminado'],
    default: 'detallado',
    description: 'Modo de presentación del libro',
  })
  @IsString()
  @IsOptional()
  modo?: string;

  @ApiPropertyOptional({
    example: '2024-01-01',
    description: 'Fecha inicial del rango (inclusive)',
  })
  @IsDateString()
  @IsOptional()
  date?: string;

  @ApiPropertyOptional({
    example: '2024-12-31',
    description: 'Fecha final del rango (inclusive)',
  })
  @IsDateString()
  @IsOptional()
  date2?: string;
}
