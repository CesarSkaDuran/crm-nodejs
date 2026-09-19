import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { TipoPartida, FrecuenciaPartida } from '../entities/partida-recurrente.entity';

export class CreatePartidaRecurrenteDto {
  @ApiProperty({ example: 'Arriendo oficina' })
  @IsString()
  @IsNotEmpty()
  nombre: string;

  @ApiProperty({ enum: TipoPartida, example: 'egreso' })
  @IsEnum(TipoPartida)
  tipo: TipoPartida;

  @ApiProperty({ example: 2500000 })
  @IsNumber()
  @IsNotEmpty()
  @Min(0.01)
  valor: number;

  @ApiProperty({ enum: FrecuenciaPartida, example: 'mensual' })
  @IsEnum(FrecuenciaPartida)
  frecuencia: FrecuenciaPartida;

  @ApiProperty({ example: '2026-09-01' })
  @IsDateString()
  @IsNotEmpty()
  fecha_inicio: string;

  @ApiPropertyOptional({ example: '2027-09-01', description: 'Opcional: última fecha en que aplica' })
  @IsDateString()
  @IsOptional()
  fecha_fin?: string;
}

export class UpdatePartidaRecurrenteDto extends CreatePartidaRecurrenteDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  estado?: number;
}
