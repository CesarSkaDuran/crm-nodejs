import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { Naturaleza } from '../entities/account.entity';

export class CreateAccountDto {
  @ApiProperty({ example: '11050501' })
  @IsString()
  @IsNotEmpty()
  codigo: string;

  @ApiProperty({ example: 'CAJA GENERAL' })
  @IsString()
  @IsNotEmpty()
  nombre: string;

  @ApiPropertyOptional({
    example: 4,
    description: '1 clase, 2 grupo, 3 cuenta, 4 auxiliar',
  })
  @IsInt()
  @Min(1)
  @Max(4)
  @IsOptional()
  clasificacion?: number;

  @ApiPropertyOptional({ example: '1' })
  @IsString()
  @IsOptional()
  clase?: string;

  @ApiPropertyOptional({ example: '11' })
  @IsString()
  @IsOptional()
  grupo?: string;

  @ApiPropertyOptional({ example: '1105' })
  @IsString()
  @IsOptional()
  cuenta?: string;

  @ApiPropertyOptional({ enum: Naturaleza, example: Naturaleza.DEBITO })
  @IsEnum(Naturaleza)
  @IsOptional()
  naturaleza?: Naturaleza;

  @ApiPropertyOptional({ example: 1 })
  @IsInt()
  @IsOptional()
  tipo?: number;

  @ApiPropertyOptional({ example: 'AXL' })
  @IsString()
  @IsOptional()
  axl?: string;

  @ApiPropertyOptional({ example: null })
  @IsInt()
  @IsOptional()
  cuenta_padre_id?: number;

  @ApiPropertyOptional({ example: 1, description: '1 activo, 0 inactivo' })
  @IsInt()
  @IsOptional()
  estado?: number;
}
