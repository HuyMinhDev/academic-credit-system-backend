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
}