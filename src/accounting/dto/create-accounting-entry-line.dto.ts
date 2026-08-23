import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateAsentadoLineDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  @IsNotEmpty()
  cuenta_contable_id: number;

  @ApiPropertyOptional({ example: 1 })
  @IsInt()
  @IsOptional()
  tercero_id?: number;

  @ApiPropertyOptional({ example: 'Pago de servicios' })
  @IsString()
  @IsOptional()
  descripcion?: string;

  @ApiProperty({ example: 100000 })
  @IsNumber()
  @IsNotEmpty()
  valor: number;

  @ApiPropertyOptional({ example: 'D' })
  @IsString()
  @IsOptional()
  naturaleza?: string;
}
