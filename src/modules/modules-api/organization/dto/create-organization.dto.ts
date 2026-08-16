import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateOrganizationDto {
  @ApiProperty({
    example: 'ORG-001',
    maxLength: 50,
    description: 'Mã tổ chức (unique, snake_case).',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  @Matches(/^[A-Za-z0-9_-]+$/, {
    message: 'code must contain only letters, digits, underscore or hyphen',
  })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  code: string;

  @ApiProperty({ example: 'Đại học Bách Khoa Hà Nội', maxLength: 255 })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  name: string;

  @ApiProperty({
    example: 'Số 1 Đại Cồ Việt, Hai Bà Trưng, Hà Nội',
    required: false,
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  address?: string;

  @ApiProperty({
    example: '0101234567',
    required: false,
    maxLength: 50,
    description: 'Mã số thuế (unique nếu có trong tương lai).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  tax_code?: string;

  @ApiProperty({ example: 'Nguyễn Văn A', required: false, maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  representative_name?: string;

  @ApiProperty({
    example: 'admin@hust.edu.vn',
    required: false,
    maxLength: 255,
  })
  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  representative_email?: string;

  @ApiProperty({ example: '0912345678', required: false, maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  representative_phone?: string;

  @ApiProperty({
    example: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0',
    maxLength: 42,
    description:
      'Địa chỉ ví admin của tổ chức (0x + 40 hex, unique trong hệ thống).',
  })
  @IsString()
  @MaxLength(42)
  @Matches(/^0x[0-9a-fA-F]{40}$/, {
    message: 'admin_wallet_address must be a valid EVM address (0x + 40 hex)',
  })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  admin_wallet_address: string;

  @ApiProperty({
    example: true,
    required: false,
    default: true,
    description: 'Trạng thái hoạt động. Có thể cập nhật qua PATCH.',
  })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
