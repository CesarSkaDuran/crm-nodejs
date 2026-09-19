import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class RegistrarPagoDto {
  @ApiProperty({ example: 1, description: 'ID del crédito' })
  @IsInt()
  @IsNotEmpty()
  credito_id: number;

  @ApiPropertyOptional({ example: 5, description: 'ID de la cuota específica' })
  @IsInt()
  @IsOptional()
  cuota_id?: number;

  @ApiProperty({ example: '2026-08-28' })
  @IsDateString()
  @IsNotEmpty()
  fecha: string;

  @ApiProperty({ example: 1 })
  @IsInt()
  @IsNotEmpty()
  tipo_comprobante_id: number;

  @ApiProperty({ example: 1 })
  @IsInt()
  @IsNotEmpty()
  banco_id: number;

  @ApiProperty({ example: 100000 })
  @IsNumber()
  @IsNotEmpty()
  @Min(1)
  valor: number;

  @ApiPropertyOptional({ example: 'Pago cuota 3' })
  @IsString()
  @IsOptional()
  descripcion?: string;

  @ApiPropertyOptional({ example: 50000, description: 'Descuento recibido: parte del saldo que el proveedor condona sin pago en efectivo' })
  @IsNumber()
  @IsOptional()
  @Min(0)
  descuento?: number;

  @ApiPropertyOptional({ example: 280, description: 'Cuenta PUC del descuento recibido (por defecto 4.2.10.40 Descuentos comerciales condicionados)' })
  @IsInt()
  @IsOptional()
  cuenta_descuento_id?: number;

  @ApiPropertyOptional({ example: false, description: 'Si true, paga todo el saldo restante' })
  @IsOptional()
  pagar_todo?: boolean;

  @ApiPropertyOptional({ example: 4100, description: 'TRM del día del pago (solo documentos en USD). Si se omite, se usa la TRM vigente registrada.' })
  @IsNumber()
  @IsOptional()
  tasa_pago?: number;

  @ApiPropertyOptional({ example: 0.5, description: 'Comisión bancaria % que el banco cobra sobre el pago. Por defecto 0. Excluida de IVA (Art. 476 E.T.) salvo comision_gravada=true.' })
  @IsNumber()
  @IsOptional()
  @Min(0)
  comision_porcentaje?: number;

  @ApiPropertyOptional({ example: false, description: 'Si true, la comisión causa IVA del 19% (descontable). Por defecto false: transferencias internacionales son excluidas (Art. 476 E.T.)' })
  @IsOptional()
  comision_gravada?: boolean;

  @ApiPropertyOptional({ example: true, description: 'Si true, adiciona el GMF 4x1000 (0.4%) como gasto bancario' })
  @IsOptional()
  aplicar_gmf?: boolean;
}
