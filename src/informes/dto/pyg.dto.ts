import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';

/**
 * Query params para el Estado de Resultados (P&G).
 *
 * Endpoint: GET /api/v1/informes/pyg
 *
 * A diferencia del Estado de Situación Financiera, el P&G SÍ usa `date` y `date2` como
 * rango de periodo: Ingresos, Costos y Gastos son cuentas de flujo
 * (nominales), no de saldo acumulado.
 */
export class PygDto {
  @ApiPropertyOptional({
    example: '2024-01-01',
    description: 'Fecha inicial del periodo (inclusive)',
  })
  @IsDateString()
  @IsOptional()
  date?: string;

  @ApiPropertyOptional({
    example: '2024-12-31',
    description: 'Fecha final del periodo (inclusive)',
  })
  @IsDateString()
  @IsOptional()
  date2?: string;
}
