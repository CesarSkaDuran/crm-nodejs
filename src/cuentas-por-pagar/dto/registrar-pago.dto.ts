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

  @ApiPropertyOptional({ example: false, description: 'Si true, paga todo el saldo restante' })
  @IsOptional()
  pagar_todo?: boolean;
}
