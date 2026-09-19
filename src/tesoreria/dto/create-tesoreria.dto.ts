import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateTesoreriaDto {
  @ApiProperty({ example: '2026-08-22' })
  @IsDateString()
  @IsNotEmpty()
  fecha: string;

  @ApiProperty({ example: 'CP0001' })
  @IsString()
  @IsNotEmpty()
  codigo: string;

  @ApiPropertyOptional({ example: 'Proveedor S.A.S' })
  @IsString()
  @IsOptional()
  nombre_tercero?: string;

  @ApiProperty({ example: 100000 })
  @IsNumber()
  @IsNotEmpty()
  valor: number;

  @ApiPropertyOptional({ example: '11100501' })
  @IsString()
  @IsOptional()
  cuenta_contable_id?: string;

  @ApiPropertyOptional({ example: '123456' })
  @IsString()
  @IsOptional()
  tercero?: string;

  @ApiProperty({
    example: 1,
    description: '1 = ingreso (entrada de dinero), 2 = egreso (salida de dinero)',
  })
  @IsInt()
  @IsNotEmpty()
  tipo: number;

  @ApiProperty({
    example: 1,
    description: 'Id del banco/caja afectado',
  })
  @IsInt()
  @IsNotEmpty()
  banco_id: number;

  @ApiProperty({
    example: 30,
    description: 'Id de la cuenta contable de contrapartida (PUC)',
  })
  @IsInt()
  @IsNotEmpty()
  cuenta_contrapartida_id: number;

  @ApiPropertyOptional({ example: 10, description: 'Código DIAN de la forma de pago' })
  @IsInt()
  @IsOptional()
  forma?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsInt()
  @IsOptional()
  estado?: number;
}
