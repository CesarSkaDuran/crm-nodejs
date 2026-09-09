import { PartialType } from '@nestjs/mapped-types';
import { CreateImpuestoDto } from './create-impuesto.dto';

export class UpdateImpuestoDto extends PartialType(CreateImpuestoDto) {}
