import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsInt, IsOptional, IsString } from 'class-validator';

/**
 * Query params para el Libro por Rango (cuentas en un rango jerárquico PUC).
 *
 * Endpoint: GET /api/v1/informes/rango
 *
 * El rango se especifica por IDs de cuenta (desde_id / hasta_id); el backend
 * resuelve los códigos PUC correspondientes y filtra jerárquicamente.
 */
export class LibroRangoDto {
  @ApiPropertyOptional({ example: 10, description: 'ID de la cuenta inicial del rango' })
  @IsInt()
  @IsOptional()
  desde_id?: number;

  @ApiPropertyOptional({ example: 100, description: 'ID de la cuenta final del rango' })
  @IsInt()
  @IsOptional()
  hasta_id?: number;

  @ApiPropertyOptional({
    example: 'resumido',
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
