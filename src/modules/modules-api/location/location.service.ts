import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateLocationDto } from './dto/create-location.dto';
import { UpdateLocationDto } from './dto/update-location.dto';
import { QueryLocationDto } from './dto/query-location.dto';
import { Prisma } from 'generated/prisma';
import { PrismaService } from 'src/modules/modules-system/prisma/prisma.service';

@Injectable()
export class LocationService {
  constructor(private readonly prisma: PrismaService) {}

  // Create Location
  async create(createLocationDto: CreateLocationDto) {
    const location = await this.prisma.locations.create({
      data: {
        ...createLocationDto,
      },
    });

    return true;
  }

  // Get All Locations
  async findAll(query: QueryLocationDto) {
    let { page, pageSize, keyword } = query;
    page = +page > 0 ? +page : 1;
    pageSize = +pageSize > 0 ? +pageSize : 10;

    const index = (page - 1) * pageSize;

    const where: Prisma.LocationsWhereInput = {
      is_deleted: false,
    };

    if (keyword && typeof keyword === 'string') {
      where.OR = [
        { location_name: { contains: keyword } },
        { province: { contains: keyword } },
        { country: { contains: keyword } },
      ];
    }

    const [locations, totalItem] = await Promise.all([
      this.prisma.locations.findMany({
        skip: index,
        take: pageSize,
        where,
        orderBy: { created_at: 'desc' },
      }),
      this.prisma.locations.count({ where }),
    ]);
    const systemFields = [
      'deleted_by',
      'is_deleted',
      'deleted_at',
      'created_at',
      'updated_at',
    ];

    // Utility function to remove system field from object
    const cleanObject = (obj: any) =>
      Object.fromEntries(
        Object.entries(obj).filter(([key]) => !systemFields.includes(key)),
      );

    // Filter data for both rooms and Locations
    const filteredLocations = locations.map((room) => {
      return {
        ...cleanObject(room),
      };
    });

    return {
      page,
      pageSize,
      totalItem,
      totalPage: Math.ceil(totalItem / pageSize),
      items: filteredLocations,
    };
  }

  // Get Detail Location
  async findOne(id: number) {
    const location = await this.prisma.locations.findUnique({
      where: { id },
    });

    if (!location || location.is_deleted) {
      throw new NotFoundException(`Location with ID ${id} not found`);
    }

    // Ẩn các field hệ thống
    const { deleted_by, is_deleted, deleted_at, ...cleanedLocation } = location;

    return cleanedLocation;
  }

  // Update Location
  async update(id: number, updateLocationDto: UpdateLocationDto) {
    const existingLocation = await this.prisma.locations.findUnique({
      where: { id },
    });

    if (!existingLocation || existingLocation.is_deleted) {
      throw new NotFoundException(`Location with ID ${id} not found`);
    }

    await this.prisma.locations.update({
      where: { id },
      data: {
        ...updateLocationDto,
        updated_at: new Date(),
      },
    });

    return true;
  }

  // Delete Location
  async remove(id: number) {
    const existingLocation = await this.prisma.locations.findUnique({
      where: { id },
    });

    if (!existingLocation || existingLocation.is_deleted) {
      throw new NotFoundException(`Location with ID ${id} not found`);
    }

    await this.prisma.locations.update({
      where: { id },
      data: {
        is_deleted: true,
        deleted_at: new Date(),
      },
    });

    return true;
  }
}
