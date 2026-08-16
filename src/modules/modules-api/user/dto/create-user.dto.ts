import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { UserRole } from '../../../../common/enums/user-role.enum';

export class CreateUserDto {
  @ApiProperty({ example: 'Nguyễn Minh Huy', maxLength: 255 })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  name: string;

  @ApiProperty({ example: 'user@example.com', maxLength: 255 })
  @IsEmail()
  @MaxLength(255)
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  email: string;

  @ApiProperty({ example: '123456', minLength: 6, maxLength: 255 })
  @IsString()
  @MinLength(6)
  @MaxLength(255)
  password: string;

  @ApiProperty({ example: '0912345678', required: false, maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @ApiProperty({
    example: '2000-10-01',
    required: false,
    type: String,
    format: 'date',
    description: 'Ngày sinh (YYYY-MM-DD). Schema lưu @db.Date, không lưu giờ.',
  })
  @IsOptional()
  @IsString({ message: 'birth_day must be a string in YYYY-MM-DD format' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'birth_day must be ISO date YYYY-MM-DD',
  })
  birth_day?: string;

  @ApiProperty({
    example: 'male',
    required: false,
    maxLength: 10,
    description: 'free-form; chuẩn hóa ở service nếu cần',
  })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  gender?: string;

  @ApiProperty({
    enum: UserRole,
    enumName: 'UserRole',
    required: false,
    default: UserRole.STUDENT,
    description:
      'Một trong: super_admin, school_admin, issuer, student, verifier. ' +
      'Mặc định = student. super_admin không được phép tạo qua API (chỉ seed). ' +
      'Khi caller là school_admin, role sẽ bị ép về "student".',
  })
  @IsOptional()
  @IsEnum(UserRole, {
    message: `role must be one of: ${Object.values(UserRole).join(', ')}`,
  })
  role?: UserRole;

  @ApiProperty({
    example: 1,
    required: false,
    type: Number,
    description:
      'ID của tổ chức. Bắt buộc khi role != super_admin. Bị bỏ qua/bắt buộc override khi caller là school_admin.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  organization_id?: number;

  @ApiProperty({
    example: 'https://cdn.example.com/avatar.jpg',
    required: false,
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  avatar?: string;

  @ApiProperty({
    example: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0',
    required: false,
    maxLength: 42,
    description:
      'Địa chỉ ví EVM (0x + 40 hex). Không bắt buộc khi tạo user. Mỗi wallet_address chỉ gắn với một user (case-insensitive).',
  })
  @IsOptional()
  @IsString()
  @MaxLength(42)
  @Matches(/^0x[0-9a-fA-F]{40}$/, {
    message: 'wallet_address must be a valid EVM address (0x + 40 hex chars)',
  })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  wallet_address?: string;
}
