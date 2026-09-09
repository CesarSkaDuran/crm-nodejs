import { IsString, IsNumber, IsOptional, Min, Max } from 'class-validator';

export class CreateImpuestoDto {
  @IsString()
  codigo: string;

  @IsString()
  nombre: string;

  @IsNumber()
  @Min(0)
  @Max(100)
  porcentaje: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  estado?: number;
}
