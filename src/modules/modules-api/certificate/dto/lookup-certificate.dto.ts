import { IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LookupCertificateDto {
  @ApiProperty({
    description: 'Plaintext certificate code to look up (1..100 chars)',
    example: 'CERT-HUST-2026-0001',
    minLength: 1,
    maxLength: 100,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  certificate_code!: string;
}
