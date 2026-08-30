import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsString, Length, IsInt } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateMonedaDto {
  @ApiProperty({ example: 'COP', description: 'Código ISO de la moneda' })
  @IsString()
  @IsNotEmpty()
  @Length(2, 3)
  codigo: string;

  @ApiProperty({ example: 'Peso colombiano' })
  @IsString()
  @IsNotEmpty()
  nombre: string;

  @ApiProperty({ example: '$' })
  @IsString()
  @IsNotEmpty()
  simbolo: string;

  @ApiProperty({ example: 1, description: 'Tasa frente a la moneda local (1 COP = 1 COP por defecto)' })
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  tasa?: number;

  @ApiPropertyOptional({ example: 1, description: '1 = moneda local; 0 = extranjera' })
  @IsInt()
  @IsOptional()
  @Type(() => Number)
  es_local?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsInt()
  @IsOptional()
  @Type(() => Number)
  orden?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsInt()
  @IsOptional()
  @Type(() => Number)
  estado?: number;
}
