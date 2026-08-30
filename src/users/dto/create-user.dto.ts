import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { UserRole } from '../entities/user.entity';

export class CreateUserDto {
  @ApiProperty({ example: 'Administrador' })
  @IsString()
  @IsNotEmpty()
  nombre: string;

  @ApiPropertyOptional({ example: 'Pérez' })
  @IsString()
  @IsOptional()
  apellido?: string;

  @ApiProperty({ example: 'admin_user' })
  @IsString()
  @IsNotEmpty()
  usuario: string;

  @ApiProperty({ example: 'admin@demo.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'admin123' })
  @IsString()
  @MinLength(4)
  password: string;

  @ApiPropertyOptional({ enum: UserRole, example: UserRole.CONTADOR })
  @IsEnum(UserRole)
  @IsOptional()
  rol?: UserRole;

  @ApiPropertyOptional({ example: 1, description: '1 activo, 0 inactivo' })
  @IsInt()
  @IsOptional()
  estado?: number;
}
