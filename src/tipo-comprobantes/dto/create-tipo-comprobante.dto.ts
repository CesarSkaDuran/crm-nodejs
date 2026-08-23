import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateTipoComprobanteDto {
  @ApiProperty({ example: 'Factura de venta' })
  @IsString()
  @IsNotEmpty()
  nombre: string;

  @ApiPropertyOptional({ example: 'FV' })
  @IsString()
  @IsOptional()
  simple?: string;

  @ApiPropertyOptional({ example: '000' })
  @IsString()
  @IsOptional()
  prefijo?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsInt()
  @IsOptional()
  consecutivo?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsInt()
  @IsOptional()
  tipo?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsInt()
  @IsOptional()
  estado?: number;
}
