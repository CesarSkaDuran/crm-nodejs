import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class CreatePeriodoPagoDto {
  @ApiProperty({ example: 'Mensual' })
  @IsString()
  @IsNotEmpty()
  nombre: string;

  @ApiProperty({ example: 30, description: 'Número de días entre cuotas' })
  @IsInt()
  @Min(1)
  dias: number;

  @ApiPropertyOptional({ example: 3, description: 'Orden de visualización' })
  @IsInt()
  @IsOptional()
  orden?: number;

  @ApiPropertyOptional({ example: 1, description: '1=activo, 0=inactivo' })
  @IsInt()
  @IsOptional()
  estado?: number;
}

export class UpdatePeriodoPagoDto {
  @ApiPropertyOptional({ example: 'Mensual' })
  @IsString()
  @IsOptional()
  nombre?: string;

  @ApiPropertyOptional({ example: 30 })
  @IsInt()
  @Min(1)
  @IsOptional()
  dias?: number;

  @ApiPropertyOptional({ example: 3 })
  @IsInt()
  @IsOptional()
  orden?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsInt()
  @IsOptional()
  estado?: number;
}
