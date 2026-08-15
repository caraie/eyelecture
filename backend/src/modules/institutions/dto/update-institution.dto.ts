import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateInstitutionDto } from './create-institution.dto';

/**
 * Domains are managed through their own endpoints (POST/DELETE
 * /institutions/:id/domains) so that adding one is an explicit, auditable act
 * rather than a side effect of a PATCH that happens to include the array.
 */
export class UpdateInstitutionDto extends PartialType(
  OmitType(CreateInstitutionDto, ['domains'] as const),
) {}
