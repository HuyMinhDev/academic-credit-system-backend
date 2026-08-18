import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export const CERTIFICATE_HISTORY_EVENT_TYPES = ['Issued', 'Revoked'] as const;
export type CertificateHistoryEventType =
  (typeof CERTIFICATE_HISTORY_EVENT_TYPES)[number];

export class HistoryCertificateDto {
  @ApiPropertyOptional({
    description:
      'Plaintext certificate code. Provide either token_id or certificate_code to scope history to a single certificate. Omit BOTH to list history for all certificates in the caller\'s organization (or all certificates for super_admin, or all owned certificates for student).',
    example: 'CERT-HUST-2026-0001',
    minLength: 1,
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  certificate_code?: string;

  @ApiPropertyOptional({
    description:
      'On-chain token id (uint256 as string). Provide either token_id or certificate_code to scope history to a single certificate. Omit BOTH to list history for all certificates in the caller\'s organization.',
    example: '1',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[0-9]+$/, { message: 'token_id must be a numeric string' })
  token_id?: string;

  @ApiPropertyOptional({
    description:
      'Filter by event type. Omit (or omit value) to return both Issued and Revoked events.',
    enum: CERTIFICATE_HISTORY_EVENT_TYPES,
    example: 'Issued',
  })
  @IsOptional()
  @IsIn(CERTIFICATE_HISTORY_EVENT_TYPES, {
    message: `type must be one of: ${CERTIFICATE_HISTORY_EVENT_TYPES.join(', ')}`,
  })
  type?: CertificateHistoryEventType;

  @ApiPropertyOptional({
    description: '1-based page number',
    example: 1,
    minimum: 1,
    default: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({
    description: 'Items per page (max 100)',
    example: 20,
    minimum: 1,
    maximum: 100,
    default: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;
}
