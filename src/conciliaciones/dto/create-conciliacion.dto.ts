import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateConciliacionDto {
  @ApiProperty({ example: 1, description: 'ID del banco/caja' })
  @IsInt()
  @IsNotEmpty()
  banco_id: number;

  @ApiProperty({ example: '2026-09', description: 'Periodo YYYY-MM' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(7)
  periodo: string;

  @ApiProperty({ example: 500000, description: 'Saldo según extracto bancario' })
  @IsNumber()
  saldo_extracto: number;

  @ApiPropertyOptional({ description: 'Notas u observaciones' })
  @IsOptional()
  @IsString()
  notas?: string;
}
