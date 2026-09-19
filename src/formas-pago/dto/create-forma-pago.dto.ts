import { IsString, IsNumber, IsOptional, Min, Max } from 'class-validator';

export class CreateFormaPagoDto {
  @IsNumber()
  codigo_dian: number;

  @IsString()
  nombre: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  estado?: number;
}
