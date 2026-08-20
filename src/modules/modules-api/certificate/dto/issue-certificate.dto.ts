import {
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CertificateMetadataPayloadDto {
  @ApiProperty({ maxLength: 255 })
  @IsString()
  @MaxLength(255)
  holder_full_name!: string;

  @ApiPropertyOptional({ maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  student_code?: string;

  @ApiProperty({ maxLength: 255 })
  @IsString()
  @MaxLength(255)
  program_name!: string;

  @ApiPropertyOptional({ maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  major?: string;

  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  degree_type?: string;

  @ApiPropertyOptional({ maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  classification?: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 10, example: 3.5 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(10)
  gpa?: number;

  @ApiPropertyOptional({ minimum: 1900, maximum: 9999 })
  @IsOptional()
  @IsInt()
  @Min(1900)
  @Max(9999)
  graduation_year?: number;

  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  issue_decision_number?: string;

  @ApiPropertyOptional({ example: '2026-06-15' })
  @IsOptional()
  @IsDateString()
  issue_date?: string;
}


export class IssueCertificateDto {
  @ApiProperty({
    description:
      'Student user id. Must exist, must not be deleted, must have wallet_address bound, must belong to the callers organization.',
    example: 12,
  })
  @IsInt()
  @Min(1)
  holder_user_id!: number;

  @ApiProperty({
    description:
      'Plaintext certificate code (1..100 chars). Hashed on-chain as keccak256 utf-8 bytes.',
    maxLength: 100,
    example: 'CERT-HUST-2026-0001',
  })
  @IsString()
  @MaxLength(100)
  certificate_code!: string;

  @ApiPropertyOptional({
    description:
      'Expiration date (ISO 8601 UTC). null = no expiry. Must be in the future.',
    example: '2027-08-15T23:59:59Z',
    nullable: true,
  })
  @IsOptional()
  @IsDateString()
  expires_at?: string;

  @ApiProperty({ type: () => CertificateMetadataPayloadDto })
  @ValidateNested()
  @Type(() => CertificateMetadataPayloadDto)
  certificate_metadata!: CertificateMetadataPayloadDto;
}
