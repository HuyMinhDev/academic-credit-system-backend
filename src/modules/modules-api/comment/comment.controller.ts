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
import { CommentService } from './comment.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { responseSuccess } from 'src/common/helpers/response.helper';
import { QueryCommentDto } from './dto/query-comment.dto';

@ApiTags('Comments')
@Controller('comments')
export class CommentController {
  constructor(private readonly commentService: CommentService) {}

  @Post()
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Create a new comment' })
  @ApiResponse({ status: 201, description: 'Comment created successfully' })
  async create(@Body() createCommentDto: CreateCommentDto) {
    const result = await this.commentService.create(createCommentDto);
    return responseSuccess(result, 'Create comment successfully');
  }

  @Get()
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get all comments (with pagination & filters)' })
  async findAll(@Query() query: QueryCommentDto) {
    const result = await this.commentService.findAll(query);
    return responseSuccess(result, 'Get all comments successfully');
  }

  @Get(':roomId')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get all comments by room ID' })
  @ApiParam({ name: 'roomId', description: 'Room ID' })
  @ApiResponse({ status: 200, description: 'List of comments for the room' })
  async findByRoomId(@Param('roomId') roomId: string) {
    const result = await this.commentService.findByRoomId(+roomId);
    return responseSuccess(
      result,
      `Get comments for room #${roomId} successfully`,
    );
  }

  @Patch(':id')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Update comment by ID' })
  @ApiParam({ name: 'id', example: 1 })
  async update(@Param('id') id: string, @Body() dto: UpdateCommentDto) {
    const result = await this.commentService.update(+id, dto);
    return responseSuccess(result, `Update comment #${id} successfully`);
  }

  @Delete(':id')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Delete comment by ID' })
  @ApiParam({ name: 'id', example: 1 })
  async remove(@Param('id') id: string) {
    const result = await this.commentService.remove(+id);
    return responseSuccess(result, `Delete comment #${id} successfully`);
  }
}
