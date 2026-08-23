import { PartialType } from '@nestjs/swagger';
import { CreateTesoreriaDto } from './create-tesoreria.dto';

export class UpdateTesoreriaDto extends PartialType(CreateTesoreriaDto) {}
