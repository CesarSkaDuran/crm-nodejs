import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateBancoDto {
  @ApiProperty({ example: 'Bancolombia' })
  @IsString()
  @IsNotEmpty()
  nombre: string;

  @ApiPropertyOptional({ example: 0 })
  @IsNumber()
  @IsOptional()
  monto?: number;

  @ApiPropertyOptional({ example: 0 })
  @IsNumber()
  @IsOptional()
  monto_dia?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsInt()
  @IsOptional()
  tipo?: number;

  @ApiPropertyOptional({ example: '11100501' })
  @IsString()
  @IsOptional()
  cuenta_id?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsInt()
  @IsOptional()
  estado?: number;
}
