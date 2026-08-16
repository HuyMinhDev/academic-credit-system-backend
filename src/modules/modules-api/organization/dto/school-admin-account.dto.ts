import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class SchoolAdminAccountDto {
  @ApiProperty({
    example: 'School Admin HUST',
    maxLength: 255,
    description: 'Tên hiển thị của school_admin.',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  name: string;

  @ApiProperty({
    example: 'schooladmin@hust.edu.vn',
    maxLength: 255,
    description: 'Email đăng nhập của school_admin (unique trong hệ thống).',
  })
  @IsEmail()
  @MaxLength(255)
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  email: string;

  @ApiProperty({
    example: 'Huy10012003@',
    minLength: 6,
    maxLength: 255,
    description: 'Mật khẩu đăng nhập (sẽ được hash trước khi lưu).',
  })
  @IsString()
  @MinLength(6)
  @MaxLength(255)
  password: string;

  @ApiProperty({
    example: '0912345678',
    required: false,
    maxLength: 50,
    description: 'Số điện thoại của school_admin.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  phone?: string;

  @ApiProperty({
    example: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0',
    maxLength: 42,
    description:
      'Địa chỉ ví EVM (0x + 40 hex) gắn với tổ chức. Trước đây là admin_wallet_address ở bảng organizations – giờ chuyển sang wallet_address của school_admin.',
  })
  @IsString()
  @MaxLength(42)
  @Matches(/^0x[0-9a-fA-F]{40}$/, {
    message: 'school_admin.wallet_address must be a valid EVM address (0x + 40 hex)',
  })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  wallet_address: string;
}
