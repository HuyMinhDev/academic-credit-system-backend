import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyCertificateDto {
  @ApiProperty({
    description:
      'Plaintext certificate code. Provide either certificate_code or token_id.',
    example: 'CERT-HUST-2026-0001',
    minLength: 1,
    maxLength: 100,
    required: false,
  })
  @IsOptional()
  @ValidateIf((o) => !o.token_id)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  certificate_code?: string;

  @ApiProperty({
    description:
      'On-chain token id (uint256 as string). Provide either token_id or certificate_code.',
    example: '1',
    required: false,
  })
  @IsOptional()
  @ValidateIf((o) => !o.certificate_code)
  @IsString()
  @Matches(/^[0-9]+$/, { message: 'token_id must be a numeric string' })
  token_id?: string;
}