import { PartialType } from '@nestjs/swagger';
import { CreateThirdDto } from './create-third.dto';

export class UpdateThirdDto extends PartialType(CreateThirdDto) {}
