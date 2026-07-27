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
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { BookingService } from './booking.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { UpdateBookingDto } from './dto/update-booking.dto';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { responseSuccess } from 'src/common/helpers/response.helper';
import { QueryBookingDto } from './dto/query-booking.dto';
import { CancelBookingDto } from './dto/cancel-booking.dto';
import { JwtAuthGuard } from 'src/common/protect/protect.guard';

@ApiTags('Booking')
@Controller('booking')
export class BookingController {
  constructor(private readonly bookingService: BookingService) {}

  @Post()
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Create a new booking (status=PENDING)' })
  @ApiResponse({ status: 201, description: 'Booking created successfully' })
  async create(@Body() createBookingDto: CreateBookingDto) {
    const result = await this.bookingService.create(createBookingDto);
    return responseSuccess(result, 'Create booking successfully');
  }

  // @Get()
  // @ApiBearerAuth('access-token')
  // @ApiOperation({ summary: 'Get all bookings (optional filter by user)' })
  // async findAll(@Query() query: QueryBookingDto) {
  //   const result = await this.bookingService.findAll(query);
  //   return responseSuccess(result, 'Get bookings successfully');
  // }

  // @Get(':id')
  // @ApiBearerAuth('access-token')
  // @ApiOperation({ summary: 'Get a booking by ID' })
  // async findOne(@Param('id') id: string) {
  //   const result = await this.bookingService.findOne(+id);
  //   return responseSuccess(result, `Get booking #${id} successfully`);
  // }

  @UseGuards(JwtAuthGuard)
  @Get()
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get all bookings (role-based view)' })
  async findAll(@Query() query: QueryBookingDto, @Req() req) {
    const { id: userId, role } = req.user;
    const result = await this.bookingService.findAll(query, role, userId);
    return responseSuccess(result, 'Get bookings successfully');
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  async findOne(@Param('id') id: string, @Req() req) {
    const { id: userId, role } = req.user;
    const result = await this.bookingService.findOne(+id, role, userId);
    return responseSuccess(result, `Get booking #${id} successfully`);
  }

  @Patch('confirm/:id')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Admin confirms a booking' })
  async confirm(@Param('id') id: string) {
    const result = await this.bookingService.confirm(+id);
    return responseSuccess(result, 'Booking confirmed');
  }

  @UseGuards(JwtAuthGuard)
  @Patch('cancel/:id')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Cancel a booking (User/Admin)' })
  @ApiResponse({ status: 200, description: 'Booking canceled successfully' })
  async cancel(
    @Param('id') id: string,
    @Body() body: CancelBookingDto,
    @Req() req,
  ) {
    const { role, id: userId } = req.user;
    const result = await this.bookingService.cancel(
      +id,
      body.reason,
      role,
      userId,
    );
    return responseSuccess(result, 'Booking canceled successfully');
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Delete booking (soft delete by role)' })
  async remove(@Param('id') id: string, @Req() req) {
    const { id: userId, role } = req.user;

    if (!['admin', 'user'].includes(role)) {
      throw new ForbiddenException('Invalid role');
    }

    const result = await this.bookingService.remove(+id, userId, role);
    return responseSuccess(result, `Booking deleted by ${role}`);
  }
}
