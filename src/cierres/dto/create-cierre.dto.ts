import { IsString, IsDateString, IsNotEmpty } from 'class-validator';

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

  @IsNotEmpty()
  @IsDateString()
  fecha_cierre: string;

  descripcion?: string;
}
