import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class PosfecharPagoDto {
  @ApiProperty({ example: 5 })
  @IsInt()
  @IsNotEmpty()
  cuota_id: number;

  @ApiProperty({ example: '2026-09-15' })
  @IsDateString()
  @IsNotEmpty()
  fecha_posfechada: string;

  @ApiPropertyOptional({ example: 'Prórroga solicitada por proveedor' })
  @IsString()
  @IsOptional()
  observacion?: string;
}
