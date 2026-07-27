// src/modules/modules-api/comment/dto/create-comment.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsNotEmpty,
  IsString,
  Max,
  Min,
  IsOptional,
  IsDateString,
} from 'class-validator';

export class CreateCommentDto {
  @ApiProperty({
    example: 'This room is very comfortable',
    description: 'Comment content',
  })
  @IsNotEmpty()
  @IsString()
  content: string;

  @ApiProperty({ example: 5, description: 'Rating from 1 to 5' })
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @ApiProperty({ example: 1, description: 'User ID who made the comment' })
  @IsInt()
  user_id: number;

  @ApiProperty({ example: 14, description: 'Room ID related to the comment' })
  @IsInt()
  room_id: number;

  @ApiPropertyOptional({
    example: '2025-10-06T12:00:00.000Z',
    description:
      'Optional comment date (ISO 8601). If omitted, server will use current time',
  })
  @IsOptional()
  @IsDateString()
  comment_date?: string;
}
