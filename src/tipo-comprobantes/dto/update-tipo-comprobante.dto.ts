import { PartialType } from '@nestjs/swagger';
import { CreateTipoComprobanteDto } from './create-tipo-comprobante.dto';

export class UpdateTipoComprobanteDto extends PartialType(CreateTipoComprobanteDto) {}
