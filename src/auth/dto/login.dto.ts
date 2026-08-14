import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'DEMO', description: 'Código de la empresa' })
  @IsString()
  @IsNotEmpty()
  codigo_empresa: string;

  @ApiProperty({ example: 'admin@demo.com' })
  @IsString()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: 'admin123' })
  @IsString()
  @IsNotEmpty()
  @MinLength(4)
  password: string;
}
