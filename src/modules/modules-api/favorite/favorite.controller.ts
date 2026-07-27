import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
} from '@nestjs/common';
import { FavoriteService } from './favorite.service';
import { CreateFavoriteDto } from './dto/create-favorite.dto';
import { UpdateFavoriteDto } from './dto/update-favorite.dto';
import { ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { responseSuccess } from 'src/common/helpers/response.helper';

@Controller('favorite')
export class FavoriteController {
  constructor(private readonly favoriteService: FavoriteService) {}

  @Post()
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Toggle favorite (add/remove)' })
  @ApiResponse({ status: 200, description: 'Favorite toggled successfully' })
  async toggleFavorite(@Body() createFavoriteDto: CreateFavoriteDto) {
    const result = await this.favoriteService.toggleFavorite(createFavoriteDto);
    return responseSuccess(result, 'Toggle favorite successfully');
  }

  @Get(':user_id/:room_id')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Check if a room is favorited by a specific user' })
  @ApiResponse({
    status: 200,
    description: 'Return favorite status for given user and room',
  })
  async findByUserAndRoom(
    @Param('user_id') userId: string,
    @Param('room_id') roomId: string,
  ) {
    const result = await this.favoriteService.findByUserAndRoom(
      +userId,
      +roomId,
    );
    return responseSuccess(
      result,
      `Check favorite status for user #${userId} and room #${roomId} successfully`,
    );
  }

  @Get(':id')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Get all favorite rooms by user ID (with pagination)',
  })
  async findOne(
    @Param('id') id: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const result = await this.favoriteService.findByUserId(
      +id,
      +page,
      +pageSize,
    );
    return responseSuccess(
      result,
      `Get favorite rooms of user #${id} successfully`,
    );
  }
}
