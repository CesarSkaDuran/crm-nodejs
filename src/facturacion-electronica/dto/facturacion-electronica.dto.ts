import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
} from 'class-validator';

export class ConfigurarFacturacionDto {
  @ApiProperty({ example: 'https://api.dian.gov.co/ubl2.1/invoice' })
  @IsString()
  @IsNotEmpty()
  api_url: string;

  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6...' })
  @IsString()
  @IsNotEmpty()
  token: string;

  @ApiProperty({ example: '187640' })
  @IsString()
  @IsNotEmpty()
  resolucion: string;

  @ApiProperty({ example: 'FE' })
  @IsString()
  @IsNotEmpty()
  prefijo: string;

  @ApiProperty({ example: 1 })
  @IsNumber()
  @IsNotEmpty()
  rango_inicio: number;

  @ApiProperty({ example: 50000 })
  @IsNumber()
  @IsNotEmpty()
  rango_fin: number;

  @ApiPropertyOptional({ example: '2026-01-01' })
  @IsDateString()
  @IsOptional()
  fecha_resolucion?: string;

  @ApiPropertyOptional({ example: '2027-01-01' })
  @IsDateString()
  @IsOptional()
  fecha_vencimiento?: string;

  @ApiPropertyOptional({ example: 'https://facturacion.dian.gov.co/' })
  @IsString()
  @IsOptional()
  company_link?: string;
}

export class EmitirFacturaDto {
  @ApiProperty({ example: 1, description: 'ID de la venta a emitir electrónicamente' })
  @IsInt()
  @IsNotEmpty()
  venta_id: number;
}
