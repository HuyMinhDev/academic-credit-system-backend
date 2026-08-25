import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { CertificateService } from './certificate.service';
import { IssueCertificateDto } from './dto/issue-certificate.dto';
import { LookupCertificateDto } from './dto/lookup-certificate.dto';
import { VerifyCertificateDto } from './dto/verify-certificate.dto';
import { RevokeCertificateDto } from './dto/revoke-certificate.dto';
import { HistoryCertificateDto } from './dto/history-certificate.dto';
import { responseSuccess } from '../../../common/helpers/response.helper';
import { Roles } from '../../../common/decorators/roles.decorator';
import { RolesGuard } from '../../../common/protect/roles.guard';
import { UserRole } from '../../../common/enums/user-role.enum';
import { users } from '@prisma/client';

type RequestWithUser = Request & { user: users };

@ApiTags('Certificate')
@ApiBearerAuth('access-token')
@UseGuards(RolesGuard)
@Controller('blockchain/certificates')
export class CertificateController {
  constructor(private readonly service: CertificateService) {}

  @Get('lookup')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Lookup certificate by plaintext certificate code. Returns DB + on-chain data.',
  })
  async lookup(@Query() dto: LookupCertificateDto) {
    const result = await this.service.lookupByCode(dto);
    return responseSuccess(result, 'Certificate found');
  }

  @Post('verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Verify whether a certificate is still valid by certificate_code. Resolves token_id from the database and compares DB against on-chain state.',
  })
  async verify(@Body() dto: VerifyCertificateDto) {
    const result = await this.service.verify(dto);
    return responseSuccess(result, 'Verification completed');
  }

  @Get('history')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Get the issue/revoke history (DB only, no blockchain calls). Two modes: (1) provide token_id or certificate_code to scope history to a single certificate; (2) omit both to list history across all certificates in the caller\'s organization (school_admin), owned by the caller (student), or globally (super_admin). Optional filters: ?type=Issued|Revoked, ?keyword=<substring of certificate_code>. Pagination: ?page=1&limit=20.',
  })
  async history(
    @Query() dto: HistoryCertificateDto,
    @Req() req: RequestWithUser,
  ) {
    const caller = req.user;
    if (!caller) {
      throw new Error('Unauthenticated');
    }
    const result = await this.service.getHistory(dto, {
      id: caller.id,
      role: caller.role as UserRole,
      organization_id: caller.organization_id,
      wallet_address: caller.wallet_address,
    });
    return responseSuccess(result, 'Certificate history retrieved');
  }

  @Post()
  @Roles(UserRole.SCHOOL_ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Issue a certificate on-chain. Backend signs and broadcasts the transaction using ISSUER_PRIVATE_KEY, then persists certificate + metadata + event.',
  })
  async issue(
    @Body() dto: IssueCertificateDto,
    @Req() req: RequestWithUser,
  ) {
    const caller = req.user;
    if (!caller) {
      throw new Error('Unauthenticated');
    }
    const result = await this.service.issue(dto, {
      id: caller.id,
      role: caller.role as UserRole,
      organization_id: caller.organization_id,
      wallet_address: caller.wallet_address,
    });
    return responseSuccess(result, 'Certificate issued successfully', 201);
  }

  @Post('revoke')
  @Roles(UserRole.SCHOOL_ADMIN, UserRole.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Revoke a certificate on-chain. Backend signs and broadcasts the transaction using ISSUER_PRIVATE_KEY, then persists revoked_at + revocation_reason_hash + event.',
  })
  async revoke(
    @Body() dto: RevokeCertificateDto,
    @Req() req: RequestWithUser,
  ) {
    const caller = req.user;
    if (!caller) {
      throw new Error('Unauthenticated');
    }
    const result = await this.service.revoke(dto, {
      id: caller.id,
      role: caller.role as UserRole,
      organization_id: caller.organization_id,
      wallet_address: caller.wallet_address,
    });
    return responseSuccess(result, 'Certificate revoked successfully');
  }
}