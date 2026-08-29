import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString } from 'class-validator';

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
  producto_id: number;

  @ApiProperty({ example: 50, description: 'Cantidad contada físicamente' })
  conteo: number;
}

export class ConsolidarInventarioDto {
  @ApiProperty({ type: 'array', description: 'Lista de conteos' })
  conteos: RegistrarConteoDto[];
}

export class FinalizarInventarioDto {
  @ApiPropertyOptional({ example: 'Ajustes aplicados' })
  @IsString()
  @IsOptional()
  observacion?: string;
}
