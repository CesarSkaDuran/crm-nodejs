import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateCobroDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  @IsNotEmpty()
  tercero_id: number;

  @ApiProperty({ example: '2026-08-25' })
  @IsDateString()
  @IsNotEmpty()
  fecha: string;

  @ApiPropertyOptional({ example: 'Cobro de facturas' })
  @IsString()
  @IsOptional()
  descripcion?: string;

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
  valor: number;
}
