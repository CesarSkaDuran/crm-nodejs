import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateMovimientoConciliacionDto {
  @ApiProperty({ description: "Origen: 'libro' o 'extracto'" })
  @IsString()
  @IsNotEmpty()
  origen: string;

  @ApiProperty({ description: '1 = ingreso, 2 = egreso' })
  @IsInt()
  @IsNotEmpty()
  tipo_movimiento: number;

  @ApiProperty({ example: '2026-09-15' })
  @IsString()
  @IsNotEmpty()
  fecha: string;

  @ApiProperty({ example: 'Comisión bancaria' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  descripcion: string;

  @ApiProperty({ example: 15000 })
  @IsNumber()
  valor: number;

  @ApiPropertyOptional({ description: 'ID de tesorería si origen=libro' })
  @IsOptional()
  @IsInt()
  tesoreria_id?: number;
}
