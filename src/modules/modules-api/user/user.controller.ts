import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  Req,
} from '@nestjs/common';
import { UserService } from './user.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { responseSuccess } from '../../../common/helpers/response.helper';
import { Roles } from '../../../common/decorators/roles.decorator';
import { UserRole } from '../../../common/enums/user-role.enum';
import { QueryUserDto } from './dto/query-location.dto';

@ApiTags('Users')
@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.SCHOOL_ADMIN)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary:
      'Create a new user (super_admin or school_admin of the same organization)',
  })
  @ApiResponse({ status: 201, description: 'User created successfully' })
  @ApiResponse({
    status: 400,
    description:
      'Invalid input, role/organization mismatch, duplicate email/wallet',
  })
  @ApiResponse({
    status: 403,
    description:
      'Caller is not super_admin/school_admin; or school_admin trying to create outside own organization',
  })
  async create(
    @Body() createUserDto: CreateUserDto,
    @Req()
    req: {
      user: {
        id: number;
        role: UserRole;
        organization_id: number | null;
      };
    },
  ) {
    const result = await this.userService.create(createUserDto, req.user);
    return responseSuccess(result, 'Create user successfully');
  }

  @Get()
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Get list of users (with pagination, search, role filter)',
  })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'pageSize', required: false, type: Number, example: 10 })
  @ApiQuery({
    name: 'keyword',
    required: false,
    type: String,
    description: 'Search by name, email, or phone',
  })
  @ApiQuery({
    name: 'role',
    required: false,
    enum: ['super_admin', 'school_admin', 'issuer', 'student', 'verifier'],
    description: 'Lọc theo role',
  })
  @ApiResponse({
    status: 200,
    description: 'List of users returned successfully',
  })
  async findAll(
    @Query() query: QueryUserDto,
    @Req()
    req: {
      user: {
        id: number;
        role: UserRole;
        organization_id: number | null;
      };
    },
  ) {
    const result = await this.userService.findAll(query, req.user);
    return result;
  }

  @Get(':id')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get user by ID' })
  @ApiParam({ name: 'id' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async findOne(@Param('id') id: string) {
    const result = await this.userService.findOne(+id);
    return responseSuccess(result, 'Get user successfully');
  }

  @Patch(':id')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Update user by ID' })
  async update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    const result = await this.userService.update(+id, dto);
    return responseSuccess(result, `Update user #${id} successfully`);
  }

  @Delete(':id')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Delete user by ID' })
  async remove(@Param('id') id: string) {
    const result = await this.userService.remove(+id);
    return responseSuccess(result, `Delete user #${id} successfully`);
  }
}
