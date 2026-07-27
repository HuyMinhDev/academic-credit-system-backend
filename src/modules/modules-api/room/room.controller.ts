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
import { RoomService } from './room.service';
import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { QueryRoomDto } from './dto/query-room.dto';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
} from '@nestjs/swagger';
import { Public } from 'src/common/decorators/public.decorator';
import { responseSuccess } from 'src/common/helpers/response.helper';

@Controller('rooms')
export class RoomController {
  constructor(private readonly roomService: RoomService) {}

  // Create Room
  @Post()
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Create a new room' })
  @ApiResponse({
    status: 201,
    description: 'Room created successfully',
  })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  async create(@Body() createRoomDto: CreateRoomDto) {
    const result = await this.roomService.create(createRoomDto);
    const response = responseSuccess(result, `Create room successfully`, 201);
    return response;
  }

  // Get All Rooms
  @Get()
  @Public()
  @ApiOperation({ summary: 'Get list of rooms (with pagination and filters)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  @ApiQuery({
    name: 'keyword',
    required: false,
    type: String,
    description: 'Search keyword (room_name, description)',
  })
  @ApiQuery({
    name: 'locationId',
    required: false,
    type: Number,
    description: 'Filter by location ID',
  })
  @ApiQuery({
    name: 'guestCount',
    required: false,
    type: Number,
    description: 'Filter by number of guests',
  })
  @ApiResponse({
    status: 200,
    description: 'List of rooms returned successfully',
  })
  async findAll(@Query() query: QueryRoomDto) {
    return this.roomService.findAll(query);
  }

  // Get Detail Room
  @Get(':id')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get a room by ID' })
  @ApiParam({ name: 'id', description: 'Room ID', example: 5 })
  @ApiResponse({ status: 200, description: 'Room fetched successfully' })
  @ApiResponse({ status: 404, description: 'Room not found' })
  async findOne(@Param('id') id: string) {
    const result = await this.roomService.findOne(+id);
    return {
      success: true,
      message: `Room #${id} fetched successfully`,
      ...result,
    };
  }

  // Update Room
  @Patch(':id')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Update a room by ID' })
  @ApiParam({ name: 'id', description: 'Room ID' })
  @ApiResponse({ status: 200, description: 'Room updated successfully' })
  @ApiResponse({ status: 404, description: 'Room not found' })
  async update(@Param('id') id: string, @Body() updateRoomDto: UpdateRoomDto) {
    const result = await this.roomService.update(+id, updateRoomDto);
    const response = responseSuccess(result, `Update room #${id} successfully`);
    return response;
  }

  // Delete Room
  @Delete(':id')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Delete a room by ID (soft delete)' })
  @ApiParam({ name: 'id', description: 'Room ID' })
  @ApiResponse({ status: 200, description: 'Room deleted successfully' })
  @ApiResponse({ status: 404, description: 'Room not found' })
  async remove(@Param('id') id: string) {
    const result = await this.roomService.remove(+id);
    const response = responseSuccess(
      result,
      `Room #${id} deleted successfully`,
      201,
    );
    return response;
  }
}
