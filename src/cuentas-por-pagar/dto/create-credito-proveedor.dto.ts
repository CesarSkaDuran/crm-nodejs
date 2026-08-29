import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export enum PeriodoDto {
  SEMANAL = 1,
  QUINCENAL = 2,
  MENSUAL = 3,
}

export class CreateCreditoProveedorDto {
  @ApiProperty({ example: 2 })
  @IsInt()
  @IsNotEmpty()
  tercero_id: number;

  @ApiProperty({ example: '2026-08-28' })
  @IsDateString()
  @IsNotEmpty()
  fecha: string;

  @ApiProperty({ example: 500000 })
  @IsNumber()
  @IsNotEmpty()
  @Min(1)
  monto_total: number;

  @ApiProperty({ example: 5 })
  @IsInt()
  @IsNotEmpty()
  @Min(1)
  numero_cuotas: number;

  @ApiProperty({ enum: PeriodoDto, example: 3 })
  @IsEnum(PeriodoDto)
  @IsNotEmpty()
  periodo: number;

  @ApiPropertyOptional({ example: 'Crédito manual a proveedor' })
  @IsString()
  @IsOptional()
  observacion?: string;

  @ApiPropertyOptional({ example: 2.5, description: 'Tasa de interés por mora (%)' })
  @IsNumber()
  @IsOptional()
  tasa_mora?: number;
}
