import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class CreateInventarioDto {
  @ApiProperty({ example: '2026-08-28' })
  @IsDateString()
  fecha: string;

  @ApiPropertyOptional({ example: 'Inventario trimestral' })
  @IsString()
  @IsOptional()
  observacion?: string;
}

export class RegistrarConteoDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  producto_id: number;

  @ApiProperty({ example: 50, description: 'Cantidad contada físicamente' })
  @IsNumber()
  conteo: number;
}

export class ConsolidarInventarioDto {
  @ApiProperty({ type: () => RegistrarConteoDto, isArray: true, description: 'Lista de conteos' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RegistrarConteoDto)
  conteos: RegistrarConteoDto[];
}

export class FinalizarInventarioDto {
  @ApiPropertyOptional({ example: 'Ajustes aplicados' })
  @IsString()
  @IsOptional()
  observacion?: string;
}
