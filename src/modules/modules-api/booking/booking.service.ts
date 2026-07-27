import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateBookingDto } from './dto/create-booking.dto';
import { UpdateBookingDto } from './dto/update-booking.dto';
import { PrismaService } from 'src/modules/modules-system/prisma/prisma.service';
import { QueryBookingDto } from './dto/query-booking.dto';
import { Prisma } from 'generated/prisma';

const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');

dayjs.extend(utc);
dayjs.extend(timezone);

@Injectable()
export class BookingService {
  constructor(private prisma: PrismaService) {}

  async create(createBookingDto: CreateBookingDto) {
    const {
      user_id,
      room_id,
      check_in,
      check_out,
      guest_quantity,
      total_price,
    } = createBookingDto;

    const user = await this.prisma.users.findUnique({ where: { id: user_id } });
    if (!user) throw new NotFoundException(`User with id ${user_id} not found`);

    const room = await this.prisma.rooms.findUnique({
      where: { id: room_id },
      select: { id: true, price: true, room_name: true },
    });
    if (!room) throw new NotFoundException(`Room with id ${room_id} not found`);

    const checkInDate = new Date(check_in);
    const checkOutDate = new Date(check_out);
    if (checkOutDate <= checkInDate)
      throw new BadRequestException('Check-out must be after check-in');

    const isConflict = await this.prisma.bookings.findFirst({
      where: {
        room_id,
        is_deleted: false,
        status: { in: ['PENDING', 'CONFIRMED'] },
        check_in: { lt: checkOutDate },
        check_out: { gt: checkInDate },
      },
    });
    if (isConflict)
      throw new BadRequestException(
        'This room is already booked in this period',
      );

    if (!total_price || total_price <= 0) {
      throw new BadRequestException(
        'total_price must be provided and positive',
      );
    }

    const booking = await this.prisma.bookings.create({
      data: {
        user_id,
        room_id,
        check_in: checkInDate,
        check_out: checkOutDate,
        total_price,
        guest_quantity: guest_quantity || 1,
        status: 'PENDING',
        created_at: new Date(),
        updated_at: new Date(),
      },
      include: {
        Users: { select: { id: true, name: true, email: true } },
        Rooms: { select: { id: true, room_name: true, price: true } },
      },
    });

    return booking;
  }

  async findAll(query: QueryBookingDto, role: string, userId: number) {
    let { page, pageSize, status, keyword, user_id } = query;
    page = +page > 0 ? +page : 1;
    pageSize = +pageSize > 0 ? +pageSize : 10;

    const index = (page - 1) * pageSize;

    const where: Prisma.BookingsWhereInput = {};

    // Role-based filter
    if (role === 'admin') {
      where.is_deleted_admin = false;
    } else if (role === 'user') {
      where.is_deleted_user = false;
      where.user_id = userId; // user chỉ xem booking của mình
    }

    if (status && typeof status === 'string') {
      where.status = status as any;
    }

    if (keyword && typeof keyword === 'string') {
      where.Rooms = {
        OR: [
          { room_name: { contains: keyword } },
          {
            Locations: {
              location_name: { contains: keyword },
            },
          },
        ],
      };
    }

    // Nếu admin truyền user_id thì lọc thêm
    if (role === 'admin' && user_id) {
      where.user_id = +user_id;
    }

    const [bookings, totalItem] = await Promise.all([
      this.prisma.bookings.findMany({
        skip: index,
        take: pageSize,
        where,
        orderBy: { created_at: 'desc' },
        include: {
          Users: {
            select: { id: true, name: true, email: true, avatar: true },
          },
          Rooms: {
            select: {
              id: true,
              room_name: true,
              price: true,
              image: true,
              Locations: {
                select: { id: true, location_name: true, province: true },
              },
            },
          },
        },
      }),
      this.prisma.bookings.count({ where }),
    ]);

    const systemFields = [
      'deleted_by',
      'is_deleted_admin',
      'is_deleted_user',
      'deleted_at',
      'updated_at',
    ];

    const cleanObject = (obj: any) =>
      Object.fromEntries(
        Object.entries(obj).filter(([key]) => !systemFields.includes(key)),
      );

    const filteredBookings = bookings.map((b) => ({
      ...cleanObject(b),
      Rooms: b.Rooms ? cleanObject(b.Rooms) : null,
    }));

    return {
      page,
      pageSize,
      totalItem,
      totalPage: Math.ceil(totalItem / pageSize),
      items: filteredBookings,
    };
  }

  async findOne(id: number, role: string, userId: number) {
    const where: Prisma.BookingsWhereInput = { id };

    if (role === 'admin') {
      where.is_deleted_admin = false;
    } else if (role === 'user') {
      where.is_deleted_user = false;
      where.user_id = userId;
    }

    const booking = await this.prisma.bookings.findFirst({
      where,
      include: {
        Users: { select: { id: true, name: true, email: true, avatar: true } },
        Rooms: {
          select: {
            id: true,
            room_name: true,
            price: true,
            image: true,
            Locations: {
              select: { id: true, location_name: true, province: true },
            },
          },
        },
      },
    });

    if (!booking) throw new NotFoundException('Booking not found');
    return booking;
  }

  async confirm(id: number) {
    const booking = await this.findOne(id as number, 'admin', 0);
    if (booking.status !== 'PENDING')
      throw new BadRequestException('Booking is not pending');

    return this.prisma.bookings.update({
      where: { id },
      data: {
        status: 'CONFIRMED',
        updated_at: new Date(),
        confirmed_at: new Date(),
      },
    });
  }

  async cancel(
    id: number,
    reason: string | undefined,
    role: 'admin' | 'user',
    userId: number,
  ) {
    const booking = await this.prisma.bookings.findUnique({ where: { id } });
    if (!booking) {
      throw new NotFoundException(`Booking with id ${id} not found`);
    }

    const vnNow = dayjs().tz('Asia/Ho_Chi_Minh').startOf('day');
    const checkInVN = dayjs(booking.check_in)
      .tz('Asia/Ho_Chi_Minh')
      .startOf('day');

    if (vnNow.isSame(checkInVN) || vnNow.isAfter(checkInVN)) {
      throw new BadRequestException('Cannot cancel on or after check-in date');
    }

    if (role === 'user' && booking.user_id !== userId) {
      throw new ForbiddenException('You cannot cancel bookings of other users');
    }

    if (booking.status === 'CANCELLED') {
      throw new BadRequestException('Booking already canceled');
    }

    const updated = await this.prisma.bookings.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        cancel_reason: reason || null,
        cancelled_by: role,
        cancelled_at: new Date(),
        updated_at: new Date(),
      },
    });

    return updated;
  }

  async remove(id: number, actorId: number, role: 'admin' | 'user') {
    const booking = await this.prisma.bookings.findUnique({ where: { id } });
    if (!booking) throw new NotFoundException('Booking not found');

    if (booking.status === 'PENDING') {
      throw new BadRequestException('Lịch chưa được xử lý, không thể xóa');
    }

    const updateData: any = { updated_at: new Date() };
    if (role === 'admin') {
      updateData.is_deleted_admin = true;
      updateData.deleted_by = actorId;
    } else if (role === 'user') {
      updateData.is_deleted_user = true;
    }

    const updated = await this.prisma.bookings.update({
      where: { id },
      data: updateData,
    });

    if (updated.is_deleted_admin && updated.is_deleted_user) {
      await this.prisma.bookings.delete({ where: { id } });
      return { message: 'Booking permanently deleted (both sides deleted)' };
    }

    return true;
  }
}
