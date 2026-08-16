import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBooleanString,
  IsInt,
  IsOptional,
  IsString,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class QueryOrganizationDto {
  @ApiPropertyOptional({ example: 1, description: 'Trang hiện tại' })
  @IsOptional()
  @IsInt()
  page?: number;

  @ApiPropertyOptional({ example: 10, description: 'Số item mỗi trang' })
  @IsOptional()
  @IsInt()
  pageSize?: number;

  @ApiPropertyOptional({
    description: 'Từ khóa tìm kiếm theo name, code, tax_code',
  })
  @IsOptional()
  @IsString()
  keyword?: string;

  @ApiPropertyOptional({
    description: 'Lọc theo trạng thái hoạt động (true/false)',
    example: 'true',
  })
  @IsOptional()
  @IsBooleanString()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  isActive?: string;
}
