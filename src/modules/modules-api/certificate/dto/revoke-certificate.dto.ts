import { IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RevokeCertificateDto {
  @ApiProperty({
    description:
      'On-chain token id (uint256 as string) of the certificate to revoke.',
    example: '1',
  })
  @IsString()
  @Matches(/^\d+$/, { message: 'token_id must be a numeric string' })
  token_id!: string;

  @ApiProperty({
    description:
      'Plaintext revocation reason. Backend hashes it with keccak256(utf-8 bytes) and stores the hash on-chain as reasonHash. Plaintext is not persisted in this MVP.',
    example: 'Issued to wrong student',
    minLength: 1,
    maxLength: 500,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;
}