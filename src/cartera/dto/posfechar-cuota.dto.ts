import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class PosfecharCuotaDto {
  @ApiProperty({ example: 5 })
  @IsInt()
  @IsNotEmpty()
  cuota_id: number;

  @ApiProperty({ example: '2026-09-15' })
  @IsDateString()
  @IsNotEmpty()
  fecha_posfechada: string;

  @ApiPropertyOptional({ example: 'Cliente solicita prórroga' })
  @IsString()
  @IsOptional()
  observacion?: string;
}
