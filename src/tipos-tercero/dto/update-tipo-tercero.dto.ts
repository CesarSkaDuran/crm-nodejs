import { PartialType } from '@nestjs/mapped-types';
import { CreateTipoTerceroDto } from './create-tipo-tercero.dto';

export class UpdateTipoTerceroDto extends PartialType(CreateTipoTerceroDto) {}
