import { IsNotEmpty, IsOptional, IsString, IsNumber, IsInt } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateTipoDocumentoDto {
  @IsString()
  @IsNotEmpty()
  codigo: string;

  @IsString()
  @IsNotEmpty()
  nombre: string;

  @IsString()
  @IsOptional()
  descripcion?: string;

  @IsInt()
  @IsOptional()
  @Type(() => Number)
  orden?: number;

  @IsInt()
  @IsOptional()
  @Type(() => Number)
  estado?: number;
}
