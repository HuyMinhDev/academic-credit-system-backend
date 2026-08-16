import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { OrganizationService } from './organization.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { QueryOrganizationDto } from './dto/query-organization.dto';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { responseSuccess } from '../../../common/helpers/response.helper';
import { Roles } from '../../../common/decorators/roles.decorator';
import { UserRole } from '../../../common/enums/user-role.enum';

@ApiTags('Organizations')
@ApiBearerAuth('access-token')
@Controller('organizations')
export class OrganizationController {
  constructor(private readonly organizationService: OrganizationService) {}

  // Create Organization - super_admin only
  @Post()
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Create a new organization (super_admin only)' })
  @ApiResponse({ status: 201, description: 'Organization created successfully' })
  @ApiResponse({
    status: 400,
    description: 'Invalid input or duplicate code/wallet/tax_code',
  })
  @ApiResponse({ status: 403, description: 'Requires super_admin role' })
  async create(
    @Body() dto: CreateOrganizationDto,
    @Req() req: { user: { id: number } },
  ) {
    const result = await this.organizationService.create(dto, req.user.id);
    return responseSuccess(result, 'Create organization successfully');
  }

  // List Organizations - filterable by isActive and search
  @Get()
  @ApiOperation({
    summary: 'Get list of organizations (pagination, search, isActive filter)',
  })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'pageSize', required: false, type: Number, example: 10 })
  @ApiQuery({
    name: 'keyword',
    required: false,
    type: String,
    description: 'Search by name, code, or tax_code',
  })
  @ApiQuery({
    name: 'isActive',
    required: false,
    type: String,
    enum: ['true', 'false'],
    description: 'Filter by active status',
  })
  async findAll(@Query() query: QueryOrganizationDto) {
    return this.organizationService.findAll(query);
  }

  // Get Detail Organization
  @Get(':id')
  @ApiOperation({ summary: 'Get organization by ID' })
  @ApiParam({ name: 'id' })
  @ApiResponse({ status: 404, description: 'Organization not found' })
  async findOne(@Param('id') id: string) {
    const result = await this.organizationService.findOne(+id);
    return responseSuccess(result, 'Get organization successfully');
  }

  // Update Organization
  @Patch(':id')
  @ApiOperation({ summary: 'Update organization by ID' })
  @ApiResponse({ status: 404, description: 'Organization not found' })
  async update(@Param('id') id: string, @Body() dto: UpdateOrganizationDto) {
    const result = await this.organizationService.update(+id, dto);
    return responseSuccess(result, `Update organization #${id} successfully`);
  }

  // Soft Delete Organization (set is_active = false)
  @Delete(':id')
  @ApiOperation({ summary: 'Soft delete organization (set is_active=false)' })
  @ApiResponse({ status: 404, description: 'Organization not found' })
  async remove(@Param('id') id: string) {
    const result = await this.organizationService.remove(+id);
    return responseSuccess(result, `Delete organization #${id} successfully`);
  }
}
