import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateFavoriteDto } from './dto/create-favorite.dto';
import { UpdateFavoriteDto } from './dto/update-favorite.dto';
import { PrismaService } from 'src/modules/modules-system/prisma/prisma.service';

@Injectable()
export class FavoriteService {
  constructor(private prisma: PrismaService) {}
  async toggleFavorite(createFavoriteDto: CreateFavoriteDto) {
    const { user_id, room_id } = createFavoriteDto;

    const user = await this.prisma.users.findUnique({ where: { id: user_id } });
    if (!user) throw new NotFoundException(`User with id ${user_id} not found`);

    const room = await this.prisma.rooms.findUnique({ where: { id: room_id } });
    if (!room) throw new NotFoundException(`Room with id ${room_id} not found`);

    const existing = await this.prisma.favorites.findFirst({
      where: { user_id, room_id },
    });

    if (existing) {
      await this.prisma.favorites.delete({ where: { id: existing.id } });
      return { is_favorite: false, message: 'Removed from favorites' };
    }

    await this.prisma.favorites.create({
      data: {
        user_id,
        room_id,
        created_at: new Date(),
      },
    });

    return {
      is_favorite: true,
      message: 'Added to favorites',
    };
  }

  // async findByUserId(userId: number) {
  //   const user = await this.prisma.users.findUnique({
  //     where: { id: userId },
  //   });

  //   if (!user) {
  //     throw new NotFoundException(`User with id ${userId} not found`);
  //   }

  //   const favorites = await this.prisma.favorites.findMany({
  //     where: { user_id: userId },
  //     orderBy: { created_at: 'desc' },
  //     include: {
  //       Rooms: true,
  //     },
  //   });

  //   const excludeFields = [
  //     'updated_at',
  //     'created_at',
  //     'deleted_at',
  //     'is_deleted',
  //     'deleted_by',
  //   ];

  //   const sanitize = (obj: any) => {
  //     if (Array.isArray(obj)) {
  //       return obj.map(sanitize);
  //     }
  //     if (obj && typeof obj === 'object') {
  //       const clean = Object.fromEntries(
  //         Object.entries(obj).filter(([key]) => !excludeFields.includes(key)),
  //       );
  //       // xử lý đệ quy cho nested objects (như Rooms)
  //       for (const key in clean) {
  //         clean[key] = sanitize(clean[key]);
  //       }
  //       return clean;
  //     }
  //     return obj;
  //   };

  //   const sanitizedFavorites = sanitize(favorites);

  //   return {
  //     total: sanitizedFavorites.length,
  //     items: sanitizedFavorites,
  //   };
  // }

  async findByUserId(userId: number, page = 1, pageSize = 10) {
    const user = await this.prisma.users.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException(`User with id ${userId} not found`);
    }

    page = +page > 0 ? +page : 1;
    pageSize = +pageSize > 0 ? +pageSize : 10;

    const skip = (page - 1) * pageSize;

    const [favorites, totalItem] = await Promise.all([
      this.prisma.favorites.findMany({
        skip,
        take: pageSize,
        where: { user_id: userId },
        orderBy: { created_at: 'desc' },
        include: {
          Rooms: {
            include: {
              Locations: {
                select: { id: true, location_name: true, province: true },
              },
            },
          },
        },
      }),
      this.prisma.favorites.count({ where: { user_id: userId } }),
    ]);

    const systemFields = [
      'updated_at',
      'created_at',
      'deleted_at',
      'is_deleted',
      'deleted_by',
    ];

    const cleanObject = (obj: any) =>
      Object.fromEntries(
        Object.entries(obj).filter(([key]) => !systemFields.includes(key)),
      );

    const sanitizedFavorites = favorites.map((fav) => ({
      ...cleanObject(fav),
      Rooms: fav.Rooms ? cleanObject(fav.Rooms) : null,
    }));

    return {
      page,
      pageSize,
      totalItem,
      totalPage: Math.ceil(totalItem / pageSize),
      items: sanitizedFavorites,
    };
  }

  async findByUserAndRoom(userId: number, roomId: number) {
    const user = await this.prisma.users.findUnique({
      where: { id: userId },
    });
    if (!user) throw new NotFoundException(`User with id ${userId} not found`);

    const room = await this.prisma.rooms.findUnique({
      where: { id: roomId },
    });
    if (!room) throw new NotFoundException(`Room with id ${roomId} not found`);

    const favorite = await this.prisma.favorites.findFirst({
      where: { user_id: userId, room_id: roomId },
    });

    return {
      user_id: userId,
      room_id: roomId,
      is_favorite: !!favorite,
    };
  }
}
