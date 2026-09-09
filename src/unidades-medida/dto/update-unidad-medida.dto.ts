import { PartialType } from '@nestjs/mapped-types';
import { CreateUnidadMedidaDto } from './create-unidad-medida.dto';

export class UpdateUnidadMedidaDto extends PartialType(CreateUnidadMedidaDto) {}
