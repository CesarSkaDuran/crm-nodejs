import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateTesoreriaDto {
  @ApiProperty({ example: '2026-08-22' })
  @IsDateString()
  @IsNotEmpty()
  fecha: string;

  @ApiProperty({ example: 'CP0001' })
  @IsString()
  @IsNotEmpty()
  codigo: string;

  @ApiPropertyOptional({ example: 'Proveedor S.A.S' })
  @IsString()
  @IsOptional()
  nombre_tercero?: string;

  @ApiProperty({ example: 100000 })
  @IsNumber()
  @IsNotEmpty()
  valor: number;

  @ApiPropertyOptional({ example: '11100501' })
  @IsString()
  @IsOptional()
  cuenta_contable_id?: string;

  @ApiPropertyOptional({ example: '123456' })
  @IsString()
  @IsOptional()
  tercero?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsNumber()
  @IsOptional()
  estado?: number;
}
