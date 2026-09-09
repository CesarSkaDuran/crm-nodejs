import { IsString, IsOptional, IsNumber, Min, Max } from 'class-validator';

export class CreateUnidadMedidaDto {
  @IsString()
  codigo: string;

  @IsString()
  nombre: string;

  @IsOptional()
  @IsString()
  descripcion?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  estado?: number;
}
