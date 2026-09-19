import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';

export class GenerarProvisionDto {
  @ApiProperty({ example: '2026-12-31', description: 'Fecha del asiento de provisión' })
  @IsDateString()
  @IsNotEmpty()
  fecha: string;

  @ApiProperty({ example: 1, description: 'Tipo de comprobante' })
  @IsInt()
  @IsNotEmpty()
  tipo_comprobante_id: number;

  @ApiPropertyOptional({ example: 'Provisión de cartera según análisis de vencimiento' })
  @IsString()
  @IsOptional()
  descripcion?: string;

  @ApiPropertyOptional({
    example: { al_dia: 0, d1_30: 1, d31_60: 3, d61_90: 5, d91_180: 10, d181_360: 20, d361_720: 50, mas_720: 100 },
    description: 'Tasas de provisión (%) por rango de mora. Si no se envían, se usan las de la cartilla comercial',
  })
  @IsObject()
  @IsOptional()
  tasas?: Record<string, number>;

  @ApiPropertyOptional({ example: 494, description: 'Cuenta de gasto provisión (por defecto 5.2.99)' })
  @IsInt()
  @IsOptional()
  cuenta_gasto_id?: number;

  @ApiPropertyOptional({ example: 45, description: 'Cuenta de provisión cartera (por defecto 1.3.99.05)' })
  @IsInt()
  @IsOptional()
  cuenta_provision_id?: number;
}
