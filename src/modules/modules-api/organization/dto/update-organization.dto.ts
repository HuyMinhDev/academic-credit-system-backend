import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateOrganizationDto } from './create-organization.dto';


export class UpdateOrganizationDto extends PartialType(
  OmitType(CreateOrganizationDto, ['school_admin'] as const),
) {}
