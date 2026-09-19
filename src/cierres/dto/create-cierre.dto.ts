import { IsString, IsDateString, IsNotEmpty, IsOptional } from 'class-validator';

export class CreateCierreDto {
  @IsNotEmpty()
  @IsString()
  periodo: string; // YYYY-MM

  @IsNotEmpty()
  @IsDateString()
  fecha_inicio: string;

  @IsNotEmpty()
  @IsDateString()
  fecha_fin: string;

  @IsOptional()
  @IsDateString()
  fecha_cierre?: string;

  @IsOptional()
  @IsString()
  descripcion?: string;
}
