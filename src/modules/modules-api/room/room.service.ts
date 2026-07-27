import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { QueryRoomDto } from './dto/query-room.dto';
import { PrismaService } from 'src/modules/modules-system/prisma/prisma.service';
import { Prisma } from 'generated/prisma';

@Injectable()
export class RoomService {
  constructor(private readonly prisma: PrismaService) {}

  // Create Room
  async create(createRoomDto: CreateRoomDto) {
    await this.prisma.rooms.create({
      data: {
        ...createRoomDto,
      },
      include: {
        Locations: true,
      },
    });

    return true;
  }

  // Get All Rooms
  async findAll(query: QueryRoomDto) {
    let { page, pageSize, keyword, locationId, guestCount } = query;
    page = +page > 0 ? +page : 1;
    pageSize = +pageSize > 0 ? +pageSize : 10;

    const index = (page - 1) * pageSize;

    const where: Prisma.RoomsWhereInput = {
      is_deleted: false,
    };

    if (keyword && typeof keyword === 'string') {
      where.OR = [
        { description: { contains: keyword } },
        { room_name: { contains: keyword } },
      ];
    }

    if (locationId && +locationId > 0) {
      where.location_id = +locationId;
    }

    if (guestCount && +guestCount > 0) {
      where.guest_count = {
        gte: +guestCount,
      };
    }

    const [rooms, totalItem] = await Promise.all([
      this.prisma.rooms.findMany({
        skip: index,
        take: pageSize,
        where,
        include: {
          Locations: true,
        },
      }),
      this.prisma.rooms.count({ where }),
    ]);

    const systemFields = [
      'deleted_by',
      'is_deleted',
      'deleted_at',
      'created_at',
      'updated_at',
    ];

    const cleanObject = (obj: any) =>
      Object.fromEntries(
        Object.entries(obj).filter(([key]) => !systemFields.includes(key)),
      );

    const filteredRooms = rooms.map((room) => {
      const { Locations, ...rest } = room;
      return {
        ...cleanObject(rest),
        Locations: Locations ? cleanObject(Locations) : null,
      };
    });

    return {
      page,
      pageSize,
      totalItem,
      totalPage: Math.ceil(totalItem / pageSize),
      items: filteredRooms,
    };
  }

  // Get Detail Room
  async findOne(id: number) {
    const room = await this.prisma.rooms.findUnique({
      where: { id },
      include: {
        Locations: true,
      },
    });

    // If not found or marked deleted
    if (!room || room.is_deleted) {
      throw new NotFoundException(`Room with ID ${id} not found`);
    }

    // Remove system fields from response
    const systemFields = [
      'deleted_by',
      'is_deleted',
      'deleted_at',
      'updated_at',
    ];

    const cleanObject = (obj: any) =>
      Object.fromEntries(
        Object.entries(obj).filter(([key]) => !systemFields.includes(key)),
      );

    const { Locations, ...rest } = room;

    return {
      message: 'Room fetched successfully',
      data: {
        ...cleanObject(rest),
        Locations: Locations ? cleanObject(Locations) : null,
      },
    };
  }

  // Update Room
  async update(id: number, updateRoomDto: UpdateRoomDto) {
    // Check if the room exists
    const existingRoom = await this.prisma.rooms.findUnique({
      where: { id },
      include: { Locations: true },
    });

    if (!existingRoom || existingRoom.is_deleted) {
      throw new NotFoundException(`Room with ID ${id} not found`);
    }

    // Update room data
    await this.prisma.rooms.update({
      where: { id },
      data: {
        ...updateRoomDto,
        updated_at: new Date(),
      },
      include: { Locations: true },
    });

    return true;
  }

  // Delete Room
  async remove(id: number) {
    const existingRoom = await this.prisma.rooms.findUnique({
      where: { id },
    });

    if (!existingRoom || existingRoom.is_deleted) {
      throw new NotFoundException(`Room with ID ${id} not found`);
    }
    // Soft delete: only mark is_deleted = true
    await this.prisma.rooms.update({
      where: { id },
      data: {
        is_deleted: true,
        deleted_at: new Date(),
      },
    });
    // await this.prisma.rooms.delete({
    //   where: { id },
    // });

    return {
      success: true,
      message: `Room #${id} has been deleted successfully`,
    };
  }
}
