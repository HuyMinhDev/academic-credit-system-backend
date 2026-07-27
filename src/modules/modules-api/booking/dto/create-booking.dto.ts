import { ApiProperty } from '@nestjs/swagger';
import {
  IsInt,
  IsOptional,
  IsDateString,
  Min,
  Max,
  IsEnum,
  IsNumber,
} from 'class-validator';

export enum BookingStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  CANCELLED = 'CANCELLED',
}

export class CreateBookingDto {
  @ApiProperty({ example: 1, description: 'ID của người dùng đặt phòng' })
  @IsInt()
  user_id: number;

  @ApiProperty({ example: 3, description: 'ID của phòng được đặt' })
  @IsInt()
  room_id: number;

  @ApiProperty({
    example: '2025-10-20T14:00:00.000Z',
    description: 'Ngày check-in (ISO 8601)',
  })
  @IsDateString()
  check_in: string;

  @ApiProperty({
    example: '2025-10-23T12:00:00.000Z',
    description: 'Ngày check-out (ISO 8601)',
  })
  @IsDateString()
  check_out: string;

  @ApiProperty({
    required: false,
    default: 1,
    minimum: 1,
    maximum: 20,
    description: 'Số lượng khách',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  guest_quantity?: number;

  @ApiProperty({
    example: 1500000,
    description: 'Tổng giá trị đơn đặt (do client tính toán gửi lên)',
  })
  @IsNumber()
  total_price: number;

  @ApiProperty({
    enum: BookingStatus,
    default: BookingStatus.PENDING,
    description: 'Trạng thái đặt phòng (admin xác nhận sau)',
  })
  @IsOptional()
  @IsEnum(BookingStatus)
  status?: BookingStatus;
}
