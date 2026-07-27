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
import { LocationService } from './location.service';
import { CreateLocationDto } from './dto/create-location.dto';
import { UpdateLocationDto } from './dto/update-location.dto';
import { Public } from 'src/common/decorators/public.decorator';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
} from '@nestjs/swagger';
import { QueryLocationDto } from './dto/query-location.dto';
import { responseSuccess } from 'src/common/helpers/response.helper';
@Controller('locations')
export class LocationController {
  constructor(private readonly locationService: LocationService) {}

  // Create a new location
  @Post()
  @ApiBearerAuth('access-token')
  // @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new location' })
  @ApiResponse({ status: 201, description: 'Location created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  async create(@Body() createLocationDto: CreateLocationDto) {
    const result = await this.locationService.create(createLocationDto);
    const response = responseSuccess(
      result,
      `Create location successfully`,
      201,
    );
    return response;
  }

  // Get all locations
  @Get()
  @Public()
  @ApiOperation({
    summary: 'Get list of locations (with pagination and filters)',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'pageSize', required: false, type: Number })
  @ApiQuery({
    name: 'keyword',
    required: false,
    type: String,
    description: 'Search keyword for location name, province, or country',
  })
  @ApiResponse({
    status: 200,
    description: 'List of locations returned successfully',
  })
  async findAll(@Query() query: QueryLocationDto) {
    return this.locationService.findAll(query);
  }

  // Get Detail Location
  @Get(':id')
  @Public()
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get a location by ID' })
  @ApiParam({ name: 'id', description: 'Location ID' })
  @ApiResponse({ status: 200, description: 'Location found successfully' })
  @ApiResponse({ status: 404, description: 'Location not found' })
  async findOne(@Param('id') id: string) {
    const result = await this.locationService.findOne(+id);
    const response = responseSuccess(
      result,
      `Get location #${id} successfully`,
    );
    return response;
  }

  // Update Location
  @Patch(':id')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Update a location by ID' })
  @ApiParam({ name: 'id', description: 'Location ID' })
  @ApiResponse({ status: 200, description: 'Location updated successfully' })
  @ApiResponse({ status: 404, description: 'Location not found' })
  async update(
    @Param('id') id: string,
    @Body() updateLocationDto: UpdateLocationDto,
  ) {
    const result = await this.locationService.update(+id, updateLocationDto);
    const response = responseSuccess(
      result,
      `Update location #${id} successfully`,
    );
    return response;
  }

  // Delete Location
  @Delete(':id')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Delete a location by ID (soft delete)' })
  @ApiParam({ name: 'id', description: 'Location ID' })
  @ApiResponse({ status: 200, description: 'Location deleted successfully' })
  @ApiResponse({ status: 404, description: 'Location not found' })
  async remove(@Param('id') id: string) {
    const result = await this.locationService.remove(+id);
    const response = responseSuccess(
      result,
      `Location #${id} deleted successfully`,
      201,
    );
    return response;
  }
}
