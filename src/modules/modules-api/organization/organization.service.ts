import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../modules-system/prisma/prisma.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { QueryOrganizationDto } from './dto/query-organization.dto';

const SAFE_ORG_SELECT = {
  id: true,
  code: true,
  name: true,
  address: true,
  tax_code: true,
  representative_name: true,
  representative_email: true,
  representative_phone: true,
  admin_wallet_address: true,
  admin_wallet_bound_at: true,
  admin_wallet_bound_by: true,
  is_active: true,
  created_by: true,
  created_at: true,
  updated_at: true,
} as const;

@Injectable()
export class OrganizationService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateOrganizationDto, currentUserId: number) {
    const adminWallet = this.normalizeWalletAddress(dto.admin_wallet_address);
    if (!adminWallet) {
      throw new BadRequestException('admin_wallet_address is invalid');
    }

    try {
      const organization = await this.prisma.organizations.create({
        data: {
          code: dto.code,
          name: dto.name,
          address: dto.address ?? null,
          tax_code: dto.tax_code ?? null,
          representative_name: dto.representative_name ?? null,
          representative_email: dto.representative_email ?? null,
          representative_phone: dto.representative_phone ?? null,
          admin_wallet_address: adminWallet,
          admin_wallet_bound_at: new Date(),
          admin_wallet_bound_by: currentUserId,
          is_active: true,
          created_by: currentUserId,
          created_at: new Date(),
          updated_at: new Date(),
        },
        select: SAFE_ORG_SELECT,
      });

      return organization;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const target =
          (error.meta?.target as string[] | string | undefined) ?? [];
        const targetFields = Array.isArray(target) ? target : [target];
        if (targetFields.includes('code')) {
          throw new BadRequestException('Organization code already exists');
        }
        if (targetFields.includes('admin_wallet_address')) {
          throw new BadRequestException(
            'admin_wallet_address already bound to another organization',
          );
        }
        if (targetFields.includes('tax_code')) {
          throw new BadRequestException('tax_code already exists');
        }
        throw new BadRequestException('Duplicate value for unique field');
      }
      if (error instanceof Prisma.PrismaClientValidationError) {
        throw new BadRequestException(
          `Invalid payload: ${error.message.split('\n').pop()?.trim() ?? 'validation failed'}`,
        );
      }
      console.error('Error creating organization:', error);
      throw new InternalServerErrorException('Failed to create organization');
    }
  }

  async findAll(query: QueryOrganizationDto) {
    let { page, pageSize, keyword, isActive } = query;
    page = +page > 0 ? +page : 1;
    pageSize = +pageSize > 0 ? +pageSize : 10;

    const skip = (page - 1) * pageSize;

    const where: Prisma.organizationsWhereInput = {};

    if (keyword && typeof keyword === 'string') {
      const k = keyword.trim();
      where.OR = [
        { name: { contains: k } },
        { code: { contains: k.toUpperCase() } },
        { tax_code: { contains: k } },
      ];
    }

    if (isActive !== undefined) {
      if (isActive === 'true') where.is_active = true;
      else if (isActive === 'false') where.is_active = false;
    }

    const [items, totalItem] = await Promise.all([
      this.prisma.organizations.findMany({
        skip,
        take: pageSize,
        where,
        orderBy: { id: 'asc' },
        select: SAFE_ORG_SELECT,
      }),
      this.prisma.organizations.count({ where }),
    ]);

    return {
      page,
      pageSize,
      totalItem,
      totalPage: Math.ceil(totalItem / pageSize),
      items,
    };
  }

  async findOne(id: number) {
    const organization = await this.prisma.organizations.findUnique({
      where: { id },
      select: SAFE_ORG_SELECT,
    });
    if (!organization) {
      throw new NotFoundException(`Organization with id ${id} not found`);
    }
    return organization;
  }

  async update(id: number, dto: UpdateOrganizationDto) {
    const existing = await this.prisma.organizations.findUnique({
      where: { id },
      select: { id: true, admin_wallet_address: true },
    });
    if (!existing) {
      throw new NotFoundException(`Organization with id ${id} not found`);
    }

    const dataToUpdate: Prisma.organizationsUpdateInput = {
      updated_at: new Date(),
    };

    if (dto.code !== undefined) dataToUpdate.code = dto.code;
    if (dto.name !== undefined) dataToUpdate.name = dto.name;
    if (dto.address !== undefined) dataToUpdate.address = dto.address || null;
    if (dto.tax_code !== undefined) dataToUpdate.tax_code = dto.tax_code || null;
    if (dto.representative_name !== undefined) {
      dataToUpdate.representative_name = dto.representative_name || null;
    }
    if (dto.representative_email !== undefined) {
      dataToUpdate.representative_email = dto.representative_email || null;
    }
    if (dto.representative_phone !== undefined) {
      dataToUpdate.representative_phone = dto.representative_phone || null;
    }
    if (dto.is_active !== undefined) dataToUpdate.is_active = dto.is_active;

    if (dto.admin_wallet_address !== undefined) {
      const normalized = this.normalizeWalletAddress(dto.admin_wallet_address);
      if (!normalized) {
        throw new BadRequestException('admin_wallet_address is invalid');
      }
      if (normalized !== existing.admin_wallet_address) {
        await this.assertAdminWalletAvailable(normalized, id);
        dataToUpdate.admin_wallet_address = normalized;
        dataToUpdate.admin_wallet_bound_at = new Date();
      }
    }

    try {
      const updated = await this.prisma.organizations.update({
        where: { id },
        data: dataToUpdate,
        select: SAFE_ORG_SELECT,
      });
      return updated;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const target =
          (error.meta?.target as string[] | string | undefined) ?? [];
        const targetFields = Array.isArray(target) ? target : [target];
        if (targetFields.includes('code')) {
          throw new BadRequestException('Organization code already exists');
        }
        if (targetFields.includes('admin_wallet_address')) {
          throw new BadRequestException(
            'admin_wallet_address already bound to another organization',
          );
        }
        throw new BadRequestException('Duplicate value for unique field');
      }
      console.error('Error updating organization:', error);
      throw new InternalServerErrorException('Failed to update organization');
    }
  }

  async remove(id: number) {
    const existing = await this.prisma.organizations.findUnique({
      where: { id },
      select: { id: true, is_active: true },
    });
    if (!existing) {
      throw new NotFoundException(`Organization with id ${id} not found`);
    }

    await this.prisma.organizations.update({
      where: { id },
      data: {
        is_active: false,
        updated_at: new Date(),
      },
    });

    return true;
  }

  private normalizeWalletAddress(input: unknown): string | null {
    if (input === null || input === undefined) return null;
    if (typeof input !== 'string') return null;
    const trimmed = input.trim();
    if (!trimmed) return null;
    if (!/^0x[0-9a-fA-F]{40}$/.test(trimmed)) return null;
    return trimmed.toLowerCase();
  }

  private async assertAdminWalletAvailable(
    walletLower: string,
    excludeOrgId?: number,
  ): Promise<void> {
    const existing = await this.prisma.organizations.findFirst({
      where: { admin_wallet_address: walletLower },
      select: { id: true },
    });
    if (existing && existing.id !== excludeOrgId) {
      throw new BadRequestException(
        'admin_wallet_address already bound to another organization',
      );
    }
  }
}
