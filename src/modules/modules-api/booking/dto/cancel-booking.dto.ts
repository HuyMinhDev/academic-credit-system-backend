import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CancelBookingDto {
  @ApiPropertyOptional({
    description: 'Lý do hủy booking (tùy chọn)',
    example: 'Tôi có việc đột xuất, không thể đến được',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
