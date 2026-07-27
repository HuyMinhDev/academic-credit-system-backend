import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, IsBoolean } from 'class-validator';

export class CreateRoomDto {
  @ApiProperty({ example: 'Phòng Deluxe Ocean View', description: 'Tên phòng' })
  @IsString()
  room_name: string;

  @ApiPropertyOptional({ example: 4, description: 'Số khách tối đa' })
  @IsOptional()
  @IsInt()
  guest_count?: number;

  @ApiPropertyOptional({ example: 2, description: 'Số phòng ngủ' })
  @IsOptional()
  @IsInt()
  bedroom_count?: number;

  @ApiPropertyOptional({ example: 2, description: 'Số giường' })
  @IsOptional()
  @IsInt()
  bed_count?: number;

  @ApiPropertyOptional({ example: 1, description: 'Số phòng tắm' })
  @IsOptional()
  @IsInt()
  bathroom_count?: number;

  @ApiPropertyOptional({
    example: 'Phòng có view biển, đầy đủ tiện nghi',
    description: 'Mô tả chi tiết',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 1200000, description: 'Giá tiền (VNĐ)' })
  @IsOptional()
  @IsInt()
  price?: number;

  // ✅ Các tiện nghi (optional boolean)
  @ApiPropertyOptional({ example: true, description: 'Có máy giặt hay không' })
  @IsOptional()
  @IsBoolean()
  washing_machine?: boolean;

  @ApiPropertyOptional({ example: true, description: 'Có bàn ủi hay không' })
  @IsOptional()
  @IsBoolean()
  iron?: boolean;

  @ApiPropertyOptional({ example: true, description: 'Có TV hay không' })
  @IsOptional()
  @IsBoolean()
  tv?: boolean;

  @ApiPropertyOptional({
    example: true,
    description: 'Có máy điều hòa hay không',
  })
  @IsOptional()
  @IsBoolean()
  air_conditioner?: boolean;

  @ApiPropertyOptional({ example: true, description: 'Có wifi hay không' })
  @IsOptional()
  @IsBoolean()
  wifi?: boolean;

  @ApiPropertyOptional({ example: true, description: 'Có bếp hay không' })
  @IsOptional()
  @IsBoolean()
  kitchen?: boolean;

  @ApiPropertyOptional({ example: true, description: 'Có chỗ đỗ xe hay không' })
  @IsOptional()
  @IsBoolean()
  parking?: boolean;

  @ApiPropertyOptional({ example: false, description: 'Có hồ bơi hay không' })
  @IsOptional()
  @IsBoolean()
  pool?: boolean;

  @ApiPropertyOptional({
    example: true,
    description: 'Có bàn làm việc hay không',
  })
  @IsOptional()
  @IsBoolean()
  desk?: boolean;

  @ApiPropertyOptional({
    example: 'https://cdn.myapp.com/uploads/rooms/room1.jpg',
    description: 'Ảnh phòng',
  })
  @IsOptional()
  @IsString()
  image?: string;

  @ApiProperty({ example: 1, description: 'ID của địa điểm (location_id)' })
  @IsInt()
  location_id: number;
}
