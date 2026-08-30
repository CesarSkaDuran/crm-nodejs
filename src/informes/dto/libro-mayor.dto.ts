import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsInt, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Query params para el Libro Mayor (movimientos de una cuenta específica).
 *
 * Endpoint: GET /api/v1/informes/libro
 */
export class LibroMayorDto {
  @ApiPropertyOptional({ example: 1001, description: 'ID de la cuenta contable' })
  @Type(() => Number)
  @IsInt()
  @IsOptional()
  cuenta_id?: number;

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
    description: 'Fecha inicial del rango (inclusive). Si se omite, trae desde el inicio del histórico.',
  })
  @IsDateString()
  @IsOptional()
  date?: string;

  @ApiPropertyOptional({
    example: '2024-12-31',
    description: 'Fecha final del rango (inclusive). Si se omite, trae hasta el último movimiento.',
  })
  @IsDateString()
  @IsOptional()
  date2?: string;
}
