import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { CreateAsentadoLineDto } from './create-accounting-entry-line.dto';

export class CreateAsentadoDto {
  @ApiProperty({ example: 'FC0001' })
  @IsString()
  @IsNotEmpty()
  consecutivo: string;

  @ApiProperty({ example: 1 })
  @IsInt()
  @IsNotEmpty()
  tipo: number;

  @ApiProperty({ example: '2026-08-22' })
  @IsDateString()
  @IsNotEmpty()
  fecha: string;

  @ApiPropertyOptional({ example: 'Comprobante de compra' })
  @IsString()
  @IsOptional()
  descripcion?: string;

  @ApiProperty({ type: [CreateAsentadoLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateAsentadoLineDto)
  detalles: CreateAsentadoLineDto[];
}
