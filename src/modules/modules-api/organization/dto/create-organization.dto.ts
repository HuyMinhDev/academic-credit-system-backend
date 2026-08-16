import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { SchoolAdminAccountDto } from './school-admin-account.dto';

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
    example: true,
    required: false,
    default: true,
    description: 'Trạng thái hoạt động. Có thể cập nhật qua PATCH.',
  })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @ApiProperty({
    type: () => SchoolAdminAccountDto,
    description:
      'Thông tin tài khoản school_admin sẽ được tạo kèm. School_admin thuộc về tổ chức này và dùng wallet_address làm admin wallet của tổ chức.',
  })
  @ValidateNested()
  @Type(() => SchoolAdminAccountDto)
  school_admin: SchoolAdminAccountDto;
}
