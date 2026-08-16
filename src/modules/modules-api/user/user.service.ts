import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../modules-system/prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { QueryUserDto } from './dto/query-location.dto';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { UserRole } from '../../../common/enums/user-role.enum';

const SAFE_USER_SELECT = {
  id: true,
  name: true,
  email: true,
  phone: true,
  role: true,
  gender: true,
  birth_day: true,
  avatar: true,
  organization_id: true,
  wallet_address: true,
  created_at: true,
  updated_at: true,
} as const;

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

    async create(
    createUserDto: CreateUserDto,
    currentUser: {
      id: number;
      role: UserRole;
      organization_id: number | null;
    },
  ) {
    const { email, password, role, birth_day, wallet_address, organization_id, ...rest } =
      createUserDto;

    const passwordHash = await bcrypt.hash(password, 10);
    const birthDayDate = this.normalizeBirthDay(birth_day);
    const walletAddress = this.normalizeWalletAddress(wallet_address);

    let finalRole: UserRole;
    let finalOrgId: number | null;

    if (currentUser.role === UserRole.SUPER_ADMIN) {
      finalRole = role ?? UserRole.STUDENT;

      if (finalRole === UserRole.SUPER_ADMIN) {
        throw new ForbiddenException(
          'super_admin cannot be created via API; use seed/migration',
        );
      }

      if (organization_id === undefined || organization_id === null) {
        throw new BadRequestException(
          `organization_id is required when role = ${finalRole}`,
        );
      }
      finalOrgId = organization_id;
    } else if (currentUser.role === UserRole.SCHOOL_ADMIN) {
      if (!currentUser.organization_id) {
        throw new ForbiddenException(
          'school_admin has no organization assigned; cannot create users',
        );
      }
      finalRole = UserRole.STUDENT;
      finalOrgId = currentUser.organization_id;
    } else {
      throw new ForbiddenException(
        'Only super_admin or school_admin can create users',
      );
    }

    if (finalOrgId !== null) {
      const org = await this.prisma.organizations.findUnique({
        where: { id: finalOrgId },
        select: { id: true, is_active: true },
      });
      if (!org) {
        throw new BadRequestException(
          `Organization with id ${finalOrgId} does not exist`,
        );
      }
      if (!org.is_active) {
        throw new BadRequestException(
          `Organization with id ${finalOrgId} is not active`,
        );
      }
    }

    if (walletAddress) {
      await this.assertWalletAddressAvailable(walletAddress);
    }

    try {
      const newUser = await this.prisma.users.create({
        data: {
          ...rest,
          email,
          password: passwordHash,
          role: finalRole,
          organization_id: finalOrgId ?? null,
          birth_day: birthDayDate ?? undefined,
          wallet_address: walletAddress ?? undefined,
          created_at: new Date(),
          updated_at: new Date(),
        },
        select: SAFE_USER_SELECT,
      });

      return newUser;
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      if (error instanceof ForbiddenException) {
        throw error;
      }

      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const target =
          (error.meta?.target as string[] | string | undefined) ?? [];
        const targetFields = Array.isArray(target) ? target : [target];
        if (targetFields.includes('email')) {
          throw new BadRequestException('Email already exists');
        }
        if (targetFields.includes('wallet_address')) {
          throw new BadRequestException('wallet_address already in use');
        }
        throw new BadRequestException('Duplicate value for unique field');
      }

      // Postgres CHECK constraint / NOT NULL / FK violation → 400 thay vì 500
      if (error instanceof Prisma.PrismaClientUnknownRequestError) {
        const msg = (error as { message?: string }).message ?? '';
        const lower = msg.toLowerCase();
        if (lower.includes('chk_users_role_organization')) {
          throw new BadRequestException(
            'role and organization_id are incompatible: ' +
              'super_admin must have organization_id = NULL; ' +
              'school_admin/student/issuer/verifier must have organization_id set.',
          );
        }
        if (lower.includes('chk_users_wallet_format')) {
          throw new BadRequestException('wallet_address format is invalid');
        }
        // Trích code SQLSTATE nếu có (e.g. 23502 = not_null_violation, 23514 = check_violation)
        const sqlStateMatch = /code:\s*"(\d{5})"/.exec(msg);
        if (sqlStateMatch) {
          const sqlState = sqlStateMatch[1];
          if (sqlState === '23502') {
            throw new BadRequestException(
              'Missing required field (NOT NULL violation): ' + msg.slice(0, 200),
            );
          }
          if (sqlState === '23514') {
            throw new BadRequestException(
              'Constraint violation: ' + msg.slice(0, 200),
            );
          }
          if (sqlState === '23503') {
            throw new BadRequestException(
              'Foreign key violation: ' + msg.slice(0, 200),
            );
          }
        }
      }

      if (error instanceof Prisma.PrismaClientValidationError) {
        throw new BadRequestException(
          `Invalid payload: ${error.message.split('\n').pop()?.trim() ?? 'validation failed'}`,
        );
      }

      console.error('Error creating user:', error);
      throw new InternalServerErrorException('Failed to create user');
    }
  }

  // Get All Users
  async findAll(
    query: QueryUserDto,
    currentUser: {
      id: number;
      role: UserRole;
      organization_id: number | null;
    },
  ) {
    let { page, pageSize, keyword, role } = query;
    page = +page > 0 ? +page : 1;
    pageSize = +pageSize > 0 ? +pageSize : 10;

    const skip = (page - 1) * pageSize;

    const where: Prisma.usersWhereInput = {
      is_deleted: false,
    };

    if (currentUser.role === UserRole.SUPER_ADMIN) {
    } else if (currentUser.role === UserRole.SCHOOL_ADMIN) {
      if (!currentUser.organization_id) {
        throw new ForbiddenException(
          'school_admin has no organization assigned; cannot list users',
        );
      }
      where.organization_id = currentUser.organization_id;
    } else {
      throw new ForbiddenException(
        'Only super_admin or school_admin can list users',
      );
    }

    if (keyword && typeof keyword === 'string') {
      where.OR = [
        { name: { contains: keyword } },
        { email: { contains: keyword } },
        { phone: { contains: keyword } },
      ];
    }

    if (role && Object.values(UserRole).includes(role as UserRole)) {
      where.role = role as UserRole;
    }

    const [users, totalItem] = await Promise.all([
      this.prisma.users.findMany({
        skip,
        take: pageSize,
        where,
        orderBy: { id: 'asc' },
        select: SAFE_USER_SELECT,
      }),
      this.prisma.users.count({ where }),
    ]);

    return {
      page,
      pageSize,
      totalItem,
      totalPage: Math.ceil(totalItem / pageSize),
      items: users,
    };
  }

  // Get Detail User
  async findOne(id: number) {
    const user = await this.prisma.users.findUnique({
      where: { id },
      select: SAFE_USER_SELECT,
    });

    if (!user) throw new NotFoundException(`User with id ${id} not found`);
    return user;
  }

  // Update User
  async update(id: number, dto: UpdateUserDto) {
    const existingUser = await this.prisma.users.findUnique({
      where: { id },
      select: { id: true, email: true, wallet_address: true },
    });
    if (!existingUser) {
      throw new NotFoundException(`User with id ${id} not found`);
    }

    if (dto.email && dto.email !== existingUser.email) {
      throw new BadRequestException('Email cannot be updated');
    }

    const {
      email: _ignoredEmail,
      password,
      birth_day,
      wallet_address,
      ...rest
    } = dto;

    const dataToUpdate: Prisma.usersUpdateInput = {
      ...rest,
      updated_at: new Date(),
    };

    if (password) {
      dataToUpdate.password = await bcrypt.hash(password, 10);
    }

    if (birth_day !== undefined) {
      const normalized = this.normalizeBirthDay(birth_day as unknown as Date);
      if (!normalized) {
        throw new BadRequestException('birth_day must be YYYY-MM-DD');
      }
      dataToUpdate.birth_day = normalized;
    }

    if (wallet_address !== undefined) {
      const normalized = this.normalizeWalletAddress(wallet_address);
      // Allow keeping the same wallet (no-op) without triggering dup-check
      if (normalized !== (existingUser.wallet_address ?? null)) {
        if (!normalized) {
          // explicit empty string or invalid → set to null (unbind)
          dataToUpdate.wallet_address = null;
        } else {
          await this.assertWalletAddressAvailable(normalized, id);
          dataToUpdate.wallet_address = normalized;
        }
      }
    }

    try {
      const updatedUser = await this.prisma.users.update({
        where: { id },
        data: dataToUpdate,
        select: SAFE_USER_SELECT,
      });

      return updatedUser;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const target =
          (error.meta?.target as string[] | string | undefined) ?? [];
        const targetFields = Array.isArray(target) ? target : [target];
        if (targetFields.includes('wallet_address')) {
          throw new BadRequestException('wallet_address already in use');
        }
        throw new BadRequestException('Duplicate value for unique field');
      }
      console.error('Error updating user:', error);
      throw new InternalServerErrorException('Failed to update user');
    }
  }

  // Delete User
  async remove(id: number) {
    const existingUser = await this.prisma.users.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existingUser)
      throw new NotFoundException(`User with id ${id} not found`);

    await this.prisma.users.update({
      where: { id },
      data: {
        is_deleted: true,
        deleted_at: new Date(),
      },
    });

    return true;
  }

  private normalizeBirthDay(input: unknown): Date | null {
    if (input === null || input === undefined || input === '') {
      return null;
    }
    if (input instanceof Date) {
      if (Number.isNaN(input.getTime())) return null;
      return new Date(
        Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate()),
      );
    }
    if (typeof input === 'string') {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input.trim());
      if (!m) return null;
      const y = Number(m[1]);
      const mo = Number(m[2]);
      const d = Number(m[3]);
      const dt = new Date(Date.UTC(y, mo - 1, d));
      if (
        dt.getUTCFullYear() !== y ||
        dt.getUTCMonth() !== mo - 1 ||
        dt.getUTCDate() !== d
      ) {
        return null;
      }
      return dt;
    }
    return null;
  }

  private normalizeWalletAddress(input: unknown): string | null {
    if (input === null || input === undefined) return null;
    if (typeof input !== 'string') return null;
    const trimmed = input.trim();
    if (!trimmed) return null;
    if (!/^0x[0-9a-fA-F]{40}$/.test(trimmed)) return null;
    return trimmed.toLowerCase();
  }

  private async assertWalletAddressAvailable(
    walletLower: string,
    excludeUserId?: number,
  ): Promise<void> {
    const where: Prisma.usersWhereInput = {
      wallet_address: { equals: walletLower },
    };
    const existing = await this.prisma.users.findFirst({
      where,
      select: { id: true },
    });
    if (existing && existing.id !== excludeUserId) {
      throw new BadRequestException('wallet_address already in use');
    }
  }
}
