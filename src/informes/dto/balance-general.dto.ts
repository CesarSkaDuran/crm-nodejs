import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';

/**
 * Query params para el Balance General.
 *
 * Endpoint: GET /api/v1/informes/balance
 *
 * IMPORTANTE: El Balance General representa un saldo ACUMULADO a una fecha
 * de corte, NO un movimiento de un periodo. Por eso:
 *   - `date2` se usa como fecha de corte (c.fecha <= date2).
 *   - `date` se IGNORA explícitamente (decisión de diseño contable).
 *
 * Si no se provee `date2`, se trae todo el histórico hasta la fecha actual.
 */
export class BalanceGeneralDto {
  @ApiPropertyOptional({
    example: '2024-12-31',
    description:
      'Fecha de corte (inclusive). El balance incluye todos los movimientos hasta esta fecha. Si se omite, trae todo el histórico.',
  })
  @IsDateString()
  @IsOptional()
  date2?: string;

  // `date` se acepta en la query por compatibilidad con el frontend, pero
  // el servicio lo ignora deliberadamente. No se declara aquí para que
  // class-validator no lo valide ni documente su uso como rango.
}
