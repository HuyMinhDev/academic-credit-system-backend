import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/modules/modules-system/prisma/prisma.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { QueryCommentDto } from './dto/query-comment.dto';
import { Prisma } from 'generated/prisma';

@Injectable()
export class CommentService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createCommentDto: CreateCommentDto) {
    const { content, rating, user_id, room_id, comment_date } =
      createCommentDto;

    const user = await this.prisma.users.findUnique({ where: { id: user_id } });
    if (!user) {
      throw new NotFoundException(`User with id ${user_id} not found`);
    }

    const room = await this.prisma.rooms.findUnique({ where: { id: room_id } });
    if (!room) {
      throw new NotFoundException(`Room with id ${room_id} not found`);
    }

    const commentDate = comment_date ? new Date(comment_date) : new Date();

    try {
      await this.prisma.comments.create({
        data: {
          content,
          rating,
          comment_date: commentDate,
          created_at: new Date(),
          updated_at: new Date(),
          Users: { connect: { id: user_id } },
          Rooms: { connect: { id: room_id } },
        },
      });

      return true;
    } catch (error) {
      console.error('Error creating comment:', error);
      throw new InternalServerErrorException('Failed to create comment');
    }
  }

  async findAll(query: QueryCommentDto) {
    let { page, pageSize, keyword, room_id, user_id } = query;

    page = +page > 0 ? +page : 1;
    pageSize = +pageSize > 0 ? +pageSize : 10;

    const skip = (page - 1) * pageSize;

    const where: Prisma.CommentsWhereInput = {};

    if (keyword && typeof keyword === 'string') {
      where.content = { contains: keyword };
    }

    if (room_id) where.room_id = +room_id;
    if (user_id) where.user_id = +user_id;

    try {
      const [comments, totalItem] = await Promise.all([
        this.prisma.comments.findMany({
          skip,
          take: pageSize,
          where,
          orderBy: { created_at: 'desc' },
          include: {
            Users: {
              select: { id: true, name: true, avatar: true },
            },
            Rooms: {
              select: { id: true, room_name: true, image: true },
            },
          },
        }),
        this.prisma.comments.count({ where }),
      ]);

      return {
        page,
        pageSize,
        totalItem,
        totalPage: Math.ceil(totalItem / pageSize),
        items: comments,
      };
    } catch (error) {
      console.error('Error fetching comments:', error);
      throw new InternalServerErrorException('Failed to fetch comments');
    }
  }

  async findByRoomId(roomId: number) {
    const roomExists = await this.prisma.rooms.findUnique({
      where: { id: roomId },
      select: { id: true, room_name: true },
    });

    if (!roomExists) {
      throw new NotFoundException(`Room with ID ${roomId} not found`);
    }

    const comments = await this.prisma.comments.findMany({
      where: { room_id: roomId },
      include: {
        Users: { select: { name: true, avatar: true } },
      },
      orderBy: { created_at: 'desc' },
    });

    if (!comments || comments.length === 0) {
      return [];
    }

    return comments.map((c) => ({
      id: c.id,
      comment_date: c.comment_date,
      content: c.content,
      rating: c.rating,
      user_comment: c.Users?.name || 'Unknown',
      avatar: c.Users?.avatar || null,
    }));
  }

  async update(id: number, updateCommentDto: UpdateCommentDto) {
    const existing = await this.prisma.comments.findUnique({ where: { id } });
    if (!existing)
      throw new NotFoundException(`Comment with ID ${id} not found`);

    await this.prisma.comments.update({
      where: { id },
      data: {
        ...updateCommentDto,
        updated_at: new Date(),
      },
    });
    return true;
  }

  async remove(id: number) {
    const existing = await this.prisma.comments.findUnique({ where: { id } });
    if (!existing)
      throw new NotFoundException(`Comment with ID ${id} not found`);

    await this.prisma.comments.delete({ where: { id } });
    return true;
  }
}
