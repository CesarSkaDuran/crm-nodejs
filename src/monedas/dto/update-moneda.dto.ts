import { PartialType } from '@nestjs/swagger';
import { CreateMonedaDto } from './create-moneda.dto';

export class UpdateMonedaDto extends PartialType(CreateMonedaDto) {}
