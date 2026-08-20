import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { ethers } from 'ethers';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../modules-system/prisma/prisma.service';
import { BlockchainService } from '../../modules-system/blockchain/blockchain.service';
import { PinataService } from '../../modules-system/pinata/pinata.service';
import {
  CERTIFICATE_MANAGER_ADDRESS,
  CHAIN_ID,
  ISSUER_PRIVATE_KEY,
  ISSUER_ROLE,
} from '../../../common/constant/app.constant';
import { UserRole } from '../../../common/enums/user-role.enum';

import { CertificatePdfService } from './certificate-pdf.service';
import {
  CertificateMetadataPayloadDto,
  IssueCertificateDto,
} from './dto/issue-certificate.dto';
import { findCertificateIssuedEvent, findCertificateRevokedEvent } from './helpers/event-parser';
import {
  extractIpfsCid,
  normalizeAddress,
  normalizeCertificateCode,
  requireBytes32,
  toIpfsGatewayUrl,
} from './helpers/hash';

const CONFIRMATIONS = 1;
const GAS_BUFFER_BPS = 2000; // +20%

interface SchoolAdminCaller {
  id: number;
  role: UserRole;
  organization_id: number | null;
  wallet_address: string | null;
}

export interface IssuedCertificateResult {
  certificate_id: number;
  token_id: string;
  tx_hash: string;
  block_number: number;
  block_timestamp: Date;
  certificate_code: string;

  holder_user_id: number;
  holder_wallet_address: string;
  organization_id: number;
  issuer_user_id: number;
  issuer_wallet_address: string;
  contract_address: string;
  chain_id: number;

  document_hash: string;
  document_ipfs_cid: string | null;
  document_uri: string | null;

  metadata_ipfs_cid: string | null;
  metadata_uri: string;

  status: string;
  issued_at: Date;
  expires_at: Date | null;
}

export interface RevokedCertificateResult {
  certificate_id: number;
  token_id: string;
  tx_hash: string;
  block_number: number;
  block_timestamp: Date;
  certificate_code: string;
  document_hash: string;
  organization_id: number;
  issuer_user_id: number;
  revoked_by_wallet_address: string;
  revocation_reason_hash: string;
  status: string;
  revoked_at: Date;
}

/**
 * Maps a smart-contract / ethers revert message to a friendlier HTTP error.
 * Falls back to a generic BadGateway for unknown messages.
 */
function mapBlockchainError(err: unknown): Error {
  const raw = err instanceof Error ? err.message : String(err);
  const lower = raw.toLowerCase();

  if (lower.includes('certificate_code already used') || lower.includes('code already used')) {
    return new ConflictException('certificate_code already used on-chain');
  }
  if (lower.includes('invalid holder')) {
    return new BadRequestException('invalid holder address on-chain');
  }
  if (lower.includes('invalid expiry') || lower.includes('invalid expiresat')) {
    return new BadRequestException('invalid expires_at on-chain');
  }
  if (lower.includes('invalid document hash') || lower.includes('invalid documenthash')) {
    return new BadRequestException('invalid document_hash on-chain');
  }
  if (lower.includes('invalid metadata uri') || lower.includes('invalid metadatauri')) {
    return new BadRequestException('invalid metadata_uri on-chain');
  }
  if (lower.includes('certificate not found')) {
    return new NotFoundException('certificate not found on-chain');
  }
  if (lower.includes('not authorized')) {
    return new ForbiddenException(
      'caller is not authorized to revoke this certificate',
    );
  }
  if (lower.includes('already revoked')) {
    return new ConflictException('certificate is already revoked on-chain');
  }
  if (lower.includes('accesscontrol') || lower.includes('missing role')) {
    return new ForbiddenException(
      'Issuer wallet is missing ISSUER_ROLE on CertificateManager',
    );
  }
  if (lower.includes('insufficient funds')) {
    return new BadGatewayException('issuer wallet has insufficient ETH for gas');
  }
  if (lower.includes('nonce')) {
    return new BadGatewayException(`nonce error: ${raw}`);
  }
  if (lower.includes('revert')) {
    return new BadGatewayException(`contract reverted: ${raw}`);
  }
  return new BadGatewayException(`blockchain error: ${raw}`);
}

const STATUS_LABELS: Record<number, string> = {
  0: 'Active',
  1: 'Revoked',
  2: 'Burned',
  3: 'Replaced',
};

function statusLabel(raw: number): string {
  return STATUS_LABELS[raw] ?? `Unknown(${raw})`;
}

import { LookupCertificateDto } from './dto/lookup-certificate.dto';
import { VerifyCertificateDto } from './dto/verify-certificate.dto';
import { RevokeCertificateDto } from './dto/revoke-certificate.dto';
import {
  CertificateHistoryEventType,
  HistoryCertificateDto,
} from './dto/history-certificate.dto';
import { formatVietnamTime } from 'src/common/helpers/datetime.helper';

export interface LookupCertificateResult {
  certificate_id: number;
  token_id: string;
  certificate_code: string;
  certificate_code_hash: string;
  document_hash: string;
  holder_user_id: number;
  holder_wallet_address: string;
  organization_id: number;
  issuer_user_id: number;
  issuer_wallet_address: string;
  issued_at: Date;
  expires_at: Date | null;
  status: string;
  revoked_at: Date | null;
  revocation_reason_hash: string | null;
  revocation_reason: string | null;
  metadata_uri: string;
  on_chain_issued_at: string;
  on_chain_expires_at: string;
  on_chain_revoked_at: string;
  on_chain_status: number;
  tx_hash: string;
  metadata?: {
    holder_full_name: string;
    student_code: string | null;
    program_name: string;
    major: string | null;
    degree_type: string | null;
    classification: string | null;
    gpa: string | null;
    graduation_year: number | null;
    issue_decision_number: string | null;
    issue_date: Date | null;
  } | null;
}

export interface CertificateHistoryEvent {
  certificate_id?: number;
  certificate_code?: string;
  event_type: CertificateHistoryEventType;
  tx_hash: string;
  block_number: string;
  block_timestamp: Date;
  log_index: number;
  chain_id: number;
  actor_wallet_address: string;
  actor_user_id: number | null;
  reason_hash: string | null;
  reason: string | null;
  payload: Prisma.JsonValue;
  indexed_at: Date;
}

export interface CertificateHistoryResult {
  scope: 'certificate';
  certificate_id: number;
  token_id: string;
  certificate_code: string;
  organization_id: number;
  issuer_user_id: number;
  holder_user_id: number;
  total_issued: number;
  total_revoked: number;
  events: CertificateHistoryEvent[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
}

export interface CertificateHistoryScopeResult {
  scope: 'organization';
  organization_id: number | null;
  organization_ids: number[] | null;
  holder_user_id: number | null;
  total_certificates: number;
  total_issued: number;
  total_revoked: number;
  events: CertificateHistoryEvent[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
}

export interface VerifyCertificateResult {
  is_valid: boolean;
  status:
    | 'VALID'
    | 'EXPIRED'
    | 'REVOKED'
    | 'NOT_FOUND'
    | 'INVALID'
    | 'DB_CHAIN_MISMATCH';
  reason: string;
  certificate_code: string;
  token_id: string;
  issued_at: Date;
  expires_at: Date | null;
  revoked_at: Date | null;
  document_hash: string;
  issuer_wallet_address: string;
  holder_wallet_address: string;
  metadata_uri: string;
  on_chain: {
    certificate_code_hash: string;
    document_hash: string;
    issuer: string;
    issued_at: string;
    expires_at: string;
    revoked_at: string;
    status: number;
    status_label: string;
  };
  mismatches: string[];
  verified_at: Date;
}

@Injectable()
export class CertificateService {
  private readonly logger = new Logger(CertificateService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly blockchain: BlockchainService,
    private readonly pinata: PinataService,
    private readonly pdfService: CertificatePdfService,
  ) {}

  async verify(
    dto: VerifyCertificateDto,
  ): Promise<VerifyCertificateResult> {
    const verifiedAt = new Date();

    // --- 1. Resolve target cert in DB -------------------------------------
    let cert: {
      id: number;
      token_id: bigint;
      certificate_code: string;
      certificate_code_hash: string;
      document_hash: string;
      holder_wallet_address: string;
      issuer_wallet_address: string;
      issued_at: Date;
      expires_at: Date | null;
      revoked_at: Date | null;
      metadata_uri: string;
    } | null = null;

    if (dto.token_id) {
      cert = await this.prisma.certificates.findFirst({
        where: {
          chain_id: CHAIN_ID,
          contract_address: CERTIFICATE_MANAGER_ADDRESS,
          token_id: BigInt(dto.token_id),
        },
        select: {
          id: true,
          token_id: true,
          certificate_code: true,
          certificate_code_hash: true,
          document_hash: true,
          holder_wallet_address: true,
          issuer_wallet_address: true,
          issued_at: true,
          expires_at: true,
          revoked_at: true,
          metadata_uri: true,
        },
      });
    } else if (dto.certificate_code) {
      const codeHashHex = ethers.keccak256(
        ethers.toUtf8Bytes(dto.certificate_code),
      );
      cert = await this.prisma.certificates.findFirst({
        where: {
          chain_id: CHAIN_ID,
          contract_address: CERTIFICATE_MANAGER_ADDRESS,
          certificate_code_hash: codeHashHex,
        },
        select: {
          id: true,
          token_id: true,
          certificate_code: true,
          certificate_code_hash: true,
          document_hash: true,
          holder_wallet_address: true,
          issuer_wallet_address: true,
          issued_at: true,
          expires_at: true,
          revoked_at: true,
          metadata_uri: true,
        },
      });
    }

    if (!cert) {
      return {
        is_valid: false,
        status: 'NOT_FOUND',
        reason:
          dto.certificate_code
            ? `Certificate with code '${dto.certificate_code}' not found`
            : `Certificate with token_id '${dto.token_id}' not found`,
        certificate_code: dto.certificate_code ?? '',
        token_id: dto.token_id ?? '',
        issued_at: verifiedAt,
        expires_at: null,
        revoked_at: null,
        document_hash: '',
        issuer_wallet_address: '',
        holder_wallet_address: '',
        metadata_uri: '',
        on_chain: {
          certificate_code_hash: '',
          document_hash: '',
          issuer: '',
          issued_at: '0',
          expires_at: '0',
          revoked_at: '0',
          status: 0,
          status_label: statusLabel(0),
        },
        mismatches: [],
        verified_at: verifiedAt,
      };
    }

    // --- 2. Fetch on-chain state -------------------------------------------
    let onChain: {
      certificateCodeHash: string;
      documentHash: string;
      issuer: string;
      issuedAt: bigint;
      expiresAt: bigint;
      revokedAt: bigint;
      previousTokenId: bigint;
      replacementTokenId: bigint;
      status: number;
      revocationReasonHash: string;
    };

    try {
      onChain = await this.blockchain.managerContract.getCertificate(
        cert.token_id,
      );
    } catch (err) {
      throw new ServiceUnavailableException(
        `Could not fetch certificate from blockchain: ${(err as Error).message}`,
      );
    }

    let isValidOnChain: boolean;
    try {
      isValidOnChain = await this.blockchain.managerContract.isValid(
        cert.token_id,
      );
    } catch (err) {
      throw new ServiceUnavailableException(
        `Could not call isValid on blockchain: ${(err as Error).message}`,
      );
    }

    // --- 3. DB <-> chain comparison ----------------------------------------
    const mismatches: string[] = [];

    const dbCodeHash = cert.certificate_code_hash.toLowerCase();
    const chainCodeHash = onChain.certificateCodeHash.toLowerCase();
    if (dbCodeHash !== chainCodeHash) {
      mismatches.push('certificate_code_hash');
    }

    const dbDocHash = cert.document_hash.toLowerCase();
    const chainDocHash = onChain.documentHash.toLowerCase();
    if (dbDocHash !== chainDocHash) {
      mismatches.push('document_hash');
    }

    const dbExpiresAtSec = cert.expires_at
      ? Math.floor(cert.expires_at.getTime() / 1000)
      : 0;
    const chainExpiresAtSec = Number(onChain.expiresAt);
    if (dbExpiresAtSec !== chainExpiresAtSec) {
      mismatches.push('expires_at');
    }

    // --- 4. Determine status -----------------------------------------------
    let status: VerifyCertificateResult['status'];
    let isValid: boolean;
    let reason: string;

    if (cert.revoked_at !== null) {
      status = 'REVOKED';
      isValid = false;
      reason = `Certificate was revoked at ${cert.revoked_at.toISOString()}`;
    } else if (
      cert.expires_at !== null &&
      cert.expires_at.getTime() <= verifiedAt.getTime()
    ) {
      status = 'EXPIRED';
      isValid = false;
      reason = `Certificate expired at ${cert.expires_at.toISOString()}`;
    } else if (mismatches.length > 0) {
      status = 'DB_CHAIN_MISMATCH';
      isValid = false;
      reason = `DB and on-chain state differ on: ${mismatches.join(', ')}`;
    } else if (!isValidOnChain) {
      status = 'INVALID';
      isValid = false;
      reason = `Contract reports isValid(tokenId=${cert.token_id}) = false (on-chain status enum: ${statusLabel(onChain.status)})`;
    } else {
      status = 'VALID';
      isValid = true;
      reason = `Certificate is valid and on-chain state matches DB (on-chain status enum: ${statusLabel(onChain.status)})`;
    }

    return {
      is_valid: isValid,
      status,
      reason,
      certificate_code: cert.certificate_code,
      token_id: cert.token_id.toString(),
      issued_at: cert.issued_at,
      expires_at: cert.expires_at,
      revoked_at: cert.revoked_at,
      document_hash: cert.document_hash,
      issuer_wallet_address: cert.issuer_wallet_address,
      holder_wallet_address: cert.holder_wallet_address,
      metadata_uri: toIpfsGatewayUrl(cert.metadata_uri),
      on_chain: {
        certificate_code_hash: onChain.certificateCodeHash,
        document_hash: onChain.documentHash,
        issuer: onChain.issuer,
        issued_at: onChain.issuedAt.toString(),
        expires_at: onChain.expiresAt.toString(),
        revoked_at: onChain.revokedAt.toString(),
        status: onChain.status,
        status_label: statusLabel(onChain.status),
      },
      mismatches,
      verified_at: verifiedAt,
    };
  }

  async lookupByCode(dto: LookupCertificateDto): Promise<LookupCertificateResult> {
    const codeHashHex = ethers.keccak256(ethers.toUtf8Bytes(dto.certificate_code));

    const cert = await this.prisma.certificates.findFirst({
      where: {
        chain_id: CHAIN_ID,
        contract_address: CERTIFICATE_MANAGER_ADDRESS,
        certificate_code_hash: codeHashHex,
      },
      include: {
        certificate_metadata: true,
      },
    });

    if (!cert) {
      throw new NotFoundException(
        `Certificate with code '${dto.certificate_code}' not found`,
      );
    }

    const [issuedEvent, latestRevokedEvent] = await Promise.all([
      this.prisma.certificate_events.findFirst({
        where: {
          certificate_id: cert.id,
          event_type: 'Issued',
        },
        select: {
          tx_hash: true,
        },
      }),
      this.prisma.certificate_events.findFirst({
        where: {
          certificate_id: cert.id,
          event_type: 'Revoked',
        },
        orderBy: [
          { block_timestamp: 'desc' },
          { log_index: 'desc' },
        ],
        select: {
          reason: true,
        },
      }),
    ]);

    let onChainCert: {
      certificateCodeHash: string;
      documentHash: string;
      issuer: string;
      issuedAt: bigint;
      expiresAt: bigint;
      revokedAt: bigint;
      previousTokenId: bigint;
      replacementTokenId: bigint;
      status: number;
      revocationReasonHash: string;
    };

    try {
      onChainCert = await this.blockchain.managerContract.getCertificate(
        BigInt(cert.token_id.toString()),
      );
    } catch (err) {
      throw new ServiceUnavailableException(
        `Could not fetch certificate from blockchain: ${(err as Error).message}`,
      );
    }

    const result: LookupCertificateResult = {
      certificate_id: cert.id,
      token_id: cert.token_id.toString(),
      certificate_code: cert.certificate_code,
      certificate_code_hash: cert.certificate_code_hash,
      document_hash: cert.document_hash,
      holder_user_id: cert.holder_user_id,
      holder_wallet_address: cert.holder_wallet_address,
      organization_id: cert.organization_id,
      issuer_user_id: cert.issuer_user_id,
      issuer_wallet_address: cert.issuer_wallet_address,
      issued_at: cert.issued_at,
      expires_at: cert.expires_at,
      status: this.mapStatus(cert.revoked_at, cert.expires_at),
      revoked_at: cert.revoked_at,
      revocation_reason_hash: cert.revocation_reason_hash ?? null,
      revocation_reason: latestRevokedEvent?.reason ?? null,
      metadata_uri: toIpfsGatewayUrl(cert.metadata_uri),
      on_chain_issued_at: onChainCert.issuedAt.toString(),
      on_chain_expires_at: onChainCert.expiresAt.toString(),
      on_chain_revoked_at: onChainCert.revokedAt.toString(),
      on_chain_status: Number(onChainCert.status),
      tx_hash: issuedEvent?.tx_hash ?? '',
      metadata: cert.certificate_metadata
        ? {
            holder_full_name: cert.certificate_metadata.holder_full_name,
            student_code: cert.certificate_metadata.student_code,
            program_name: cert.certificate_metadata.program_name,
            major: cert.certificate_metadata.major,
            degree_type: cert.certificate_metadata.degree_type,
            classification: cert.certificate_metadata.classification,
            gpa: cert.certificate_metadata.gpa?.toString() ?? null,
            graduation_year: cert.certificate_metadata.graduation_year,
            issue_decision_number: cert.certificate_metadata.issue_decision_number,
            issue_date: cert.certificate_metadata.issue_date,
          }
        : null,
    };
    return result;
  }

  private mapStatus(revokedAt: Date | null, expiresAt: Date | null): string {
    if (revokedAt) return 'REVOKED';
    if (expiresAt && expiresAt < new Date()) return 'EXPIRED';
    return 'ACTIVE';
  }

  async getHistory(
    dto: HistoryCertificateDto,
    caller: SchoolAdminCaller,
  ): Promise<CertificateHistoryResult | CertificateHistoryScopeResult> {
    const isSingleCertLookup = Boolean(dto.token_id || dto.certificate_code);

    if (isSingleCertLookup) {
      return this.getHistoryForSingleCertificate(dto, caller);
    }
    return this.getHistoryForScope(dto, caller);
  }

  private async getHistoryForSingleCertificate(
    dto: HistoryCertificateDto,
    caller: SchoolAdminCaller,
  ): Promise<CertificateHistoryResult> {
    // --- 1. Resolve the certificate ---------------------------------------
    let cert: {
      id: number;
      token_id: bigint;
      certificate_code: string;
      organization_id: number;
      issuer_user_id: number;
      holder_user_id: number;
    } | null = null;

    if (dto.token_id) {
      cert = await this.prisma.certificates.findFirst({
        where: {
          chain_id: CHAIN_ID,
          contract_address: CERTIFICATE_MANAGER_ADDRESS,
          token_id: BigInt(dto.token_id),
        },
        select: {
          id: true,
          token_id: true,
          certificate_code: true,
          organization_id: true,
          issuer_user_id: true,
          holder_user_id: true,
        },
      });
    } else if (dto.certificate_code) {
      const codeHashHex = ethers.keccak256(
        ethers.toUtf8Bytes(dto.certificate_code),
      );
      cert = await this.prisma.certificates.findFirst({
        where: {
          chain_id: CHAIN_ID,
          contract_address: CERTIFICATE_MANAGER_ADDRESS,
          certificate_code_hash: codeHashHex,
        },
        select: {
          id: true,
          token_id: true,
          certificate_code: true,
          organization_id: true,
          issuer_user_id: true,
          holder_user_id: true,
        },
      });
    }

    if (!cert) {
      throw new NotFoundException(
        dto.certificate_code
          ? `Certificate with code '${dto.certificate_code}' not found`
          : `Certificate with token_id '${dto.token_id}' not found`,
      );
    }

    // --- 2. Authorization (single cert) -----------------------------------
    this.assertCanAccessCertificate(caller, {
      organization_id: cert.organization_id,
      holder_user_id: cert.holder_user_id,
    });

    // --- 3. Build event query ----------------------------------------------
    const eventWhere = this.buildEventWhereForCertificate(cert.id, dto.type);

    // --- 4. Aggregate counts (always Issued/Revoked totals, ignoring filter) -
    const countGroups = await this.prisma.certificate_events.groupBy({
      by: ['event_type'],
      where: {
        certificate_id: cert.id,
        event_type: { in: ['Issued', 'Revoked'] },
      },
      _count: { _all: true },
    });

    const totalIssued = countGroups.find((g) => g.event_type === 'Issued')?._count._all ?? 0;
    const totalRevoked = countGroups.find((g) => g.event_type === 'Revoked')?._count._all ?? 0;

    // --- 5. Paginated event list -------------------------------------------
    const { events, total } = await this.fetchHistoryEvents(
      eventWhere,
      dto.page,
      dto.limit,
    );

    return {
      scope: 'certificate',
      certificate_id: cert.id,
      token_id: cert.token_id.toString(),
      certificate_code: cert.certificate_code,
      organization_id: cert.organization_id,
      issuer_user_id: cert.issuer_user_id,
      holder_user_id: cert.holder_user_id,
      total_issued: totalIssued,
      total_revoked: totalRevoked,
      events,
      pagination: {
        page: dto.page,
        limit: dto.limit,
        total,
        total_pages: total === 0 ? 0 : Math.ceil(total / dto.limit),
      },
    };
  }

  private async getHistoryForScope(
    dto: HistoryCertificateDto,
    caller: SchoolAdminCaller,
  ): Promise<CertificateHistoryScopeResult> {
    // --- 1. Determine scope filters from caller role ----------------------
    let organizationIds: number[] | null = null;
    let singleOrganizationId: number | null = null;
    let holderUserId: number | null = null;

    if (caller.role === UserRole.SUPER_ADMIN) {
      // no org filter
    } else if (caller.role === UserRole.SCHOOL_ADMIN) {
      if (caller.organization_id === null) {
        throw new ForbiddenException('school_admin has no organization assigned');
      }
      organizationIds = [caller.organization_id];
      singleOrganizationId = caller.organization_id;
    } else if (caller.role === UserRole.STUDENT) {
      holderUserId = caller.id;
    } else {
      throw new ForbiddenException(
        'You are not authorized to view certificate history',
      );
    }

    // --- 2. Resolve the certificate_id set we are scoping to ------------
    const certWhere: Prisma.certificatesWhereInput = {
      chain_id: CHAIN_ID,
      contract_address: CERTIFICATE_MANAGER_ADDRESS,
    };
    if (organizationIds !== null) {
      certWhere.organization_id = { in: organizationIds };
    }
    if (holderUserId !== null) {
      certWhere.holder_user_id = holderUserId;
    }

    const certIds = await this.prisma.certificates.findMany({
      where: certWhere,
      select: { id: true },
    });
    const certIdList = certIds.map((c) => c.id);

    // If no certificates in scope, return empty result immediately
    if (certIdList.length === 0) {
      return {
        scope: 'organization',
        organization_id: singleOrganizationId,
        organization_ids: organizationIds,
        holder_user_id: holderUserId,
        total_certificates: 0,
        total_issued: 0,
        total_revoked: 0,
        events: [],
        pagination: {
          page: dto.page,
          limit: dto.limit,
          total: 0,
          total_pages: 0,
        },
      };
    }

    // --- 3. Build event query (filter by certificate_id set) ---------------
    const eventWhere: Prisma.certificate_eventsWhereInput = {
      certificate_id: { in: certIdList },
    };
    if (dto.type) {
      eventWhere.event_type = dto.type;
    } else {
      eventWhere.event_type = { in: ['Issued', 'Revoked'] };
    }

    // --- 4. Aggregate counts (always Issued/Revoked totals, ignoring filter) -
    const countGroups = await this.prisma.certificate_events.groupBy({
      by: ['event_type'],
      where: {
        certificate_id: { in: certIdList },
        event_type: { in: ['Issued', 'Revoked'] },
      },
      _count: { _all: true },
    });

    const totalIssued = countGroups.find((g) => g.event_type === 'Issued')?._count._all ?? 0;
    const totalRevoked = countGroups.find((g) => g.event_type === 'Revoked')?._count._all ?? 0;

    // --- 5. Paginated event list with certificate join --------------------
    const skip = (dto.page - 1) * dto.limit;
    const [eventsRaw, total] = await Promise.all([
      this.prisma.certificate_events.findMany({
        where: eventWhere,
        orderBy: [
          { block_timestamp: 'desc' },
          { log_index: 'desc' },
        ],
        skip,
        take: dto.limit,
        select: {
          certificate_id: true,
          certificates: { select: { certificate_code: true } },
          event_type: true,
          tx_hash: true,
          block_number: true,
          block_timestamp: true,
          log_index: true,
          chain_id: true,
          actor_wallet_address: true,
          actor_user_id: true,
          reason_hash: true,
          reason: true,
          payload: true,
          indexed_at: true,
        },
      }),
      this.prisma.certificate_events.count({ where: eventWhere }),
    ]);

    const events: CertificateHistoryEvent[] = eventsRaw.map((e) => ({
      certificate_id: e.certificate_id ?? undefined,
      certificate_code: e.certificates?.certificate_code,
      event_type: e.event_type as CertificateHistoryEventType,
      tx_hash: e.tx_hash,
      block_number: e.block_number.toString(),
      block_timestamp: e.block_timestamp,
      log_index: e.log_index,
      chain_id: e.chain_id,
      actor_wallet_address: e.actor_wallet_address,
      actor_user_id: e.actor_user_id,
      reason_hash: e.reason_hash,
      reason: e.reason,
      payload: e.payload,
      indexed_at: e.indexed_at,
    }));

    return {
      scope: 'organization',
      organization_id: singleOrganizationId,
      organization_ids: organizationIds,
      holder_user_id: holderUserId,
      total_certificates: certIdList.length,
      total_issued: totalIssued,
      total_revoked: totalRevoked,
      events,
      pagination: {
        page: dto.page,
        limit: dto.limit,
        total,
        total_pages: total === 0 ? 0 : Math.ceil(total / dto.limit),
      },
    };
  }

  private assertCanAccessCertificate(
    caller: SchoolAdminCaller,
    cert: { organization_id: number; holder_user_id: number },
  ): void {
    if (caller.role === UserRole.SUPER_ADMIN) {
      return;
    }
    if (caller.role === UserRole.SCHOOL_ADMIN) {
      if (caller.organization_id === null) {
        throw new ForbiddenException('school_admin has no organization assigned');
      }
      if (cert.organization_id !== caller.organization_id) {
        throw new ForbiddenException(
          'You can only view history for certificates in your organization',
        );
      }
      return;
    }
    if (caller.role === UserRole.STUDENT) {
      if (cert.holder_user_id !== caller.id) {
        throw new ForbiddenException(
          'You can only view history for your own certificates',
        );
      }
      return;
    }
    throw new ForbiddenException(
      'You are not authorized to view certificate history',
    );
  }

  private buildEventWhereForCertificate(
    certificateId: number,
    type: CertificateHistoryEventType | undefined,
  ): Prisma.certificate_eventsWhereInput {
    const where: Prisma.certificate_eventsWhereInput = {
      certificate_id: certificateId,
    };
    if (type) {
      where.event_type = type;
    } else {
      where.event_type = { in: ['Issued', 'Revoked'] };
    }
    return where;
  }

  private async fetchHistoryEvents(
    where: Prisma.certificate_eventsWhereInput,
    page: number,
    limit: number,
  ): Promise<{ events: CertificateHistoryEvent[]; total: number }> {
    const skip = (page - 1) * limit;
    const [eventsRaw, total] = await Promise.all([
      this.prisma.certificate_events.findMany({
        where,
        orderBy: [
          { block_timestamp: 'desc' },
          { log_index: 'desc' },
        ],
        skip,
        take: limit,
        select: {
          event_type: true,
          tx_hash: true,
          block_number: true,
          block_timestamp: true,
          log_index: true,
          chain_id: true,
          actor_wallet_address: true,
          actor_user_id: true,
          reason_hash: true,
          reason: true,
          payload: true,
          indexed_at: true,
        },
      }),
      this.prisma.certificate_events.count({ where }),
    ]);

    const events: CertificateHistoryEvent[] = eventsRaw.map((e) => ({
      event_type: e.event_type as CertificateHistoryEventType,
      tx_hash: e.tx_hash,
      block_number: e.block_number.toString(),
      block_timestamp: e.block_timestamp,
      log_index: e.log_index,
      chain_id: e.chain_id,
      actor_wallet_address: e.actor_wallet_address,
      actor_user_id: e.actor_user_id,
      reason_hash: e.reason_hash,
      reason: e.reason,
      payload: e.payload,
      indexed_at: e.indexed_at,
    }));

    return { events, total };
  }

  async issue(
    dto: IssueCertificateDto,
    caller: SchoolAdminCaller,
  ): Promise<IssuedCertificateResult> {
    this.assertSchoolAdmin(caller);
    this.assertIssuerKeyConfigured();
    this.assertContractConfigured();

    const organizationId = caller.organization_id;
    if (organizationId === null) {
      throw new ForbiddenException('school_admin has no organization assigned');
    }

    // --- 1. Validate inputs -------------------------------------------------
    const certCode = normalizeCertificateCode(dto.certificate_code);
    if (!certCode) {
      throw new BadRequestException('certificate_code invalid (1..100 chars)');
    }

    let expiresAt = 0;
    if (dto.expires_at) {
      expiresAt = Math.floor(new Date(dto.expires_at).getTime() / 1000);
      if (expiresAt <= Math.floor(Date.now() / 1000)) {
        throw new BadRequestException(
          'expires_at must be in the future',
        );
      }
    }

    const codeHashHex = ethers.keccak256(ethers.toUtf8Bytes(certCode));

    // --- 2. Holder checks ---------------------------------------------------
    const holder = await this.loadHolder(dto.holder_user_id);
    this.assertSameOrganization(holder, organizationId);

    // --- 2.0 Load organization for PDF generation ---------------------------
    const organization = await this.prisma.organizations.findUnique({
      where: { id: organizationId },
      select: { id: true, name: true, code: true, address: true },
    });
    if (!organization) {
      throw new NotFoundException(
        `organization ${organizationId} not found in DB`,
      );
    }

    // --- 2.5 Pre-flight DB uniqueness ---------------------------------------
    const inDb = await this.prisma.certificates.findFirst({
      where: {
        chain_id: CHAIN_ID,
        contract_address: CERTIFICATE_MANAGER_ADDRESS,
        certificate_code_hash: codeHashHex,
      },
      select: { id: true },
    });
    if (inDb) {
      throw new ConflictException('certificate_code already recorded in DB');
    }

    // --- 3. Issuer wallet from ISSUER_PRIVATE_KEY ---------------------------
    const issuerAccount = new ethers.Wallet(ISSUER_PRIVATE_KEY, this.blockchain.provider);
    const issuerWallet = normalizeAddress(issuerAccount.address);
    if (!issuerWallet) {
      throw new InternalServerErrorException(
        'ISSUER_PRIVATE_KEY did not derive a valid address',
      );
    }

    const callerWallet = normalizeAddress(caller.wallet_address);
    if (callerWallet && callerWallet.toLowerCase() !== issuerWallet.toLowerCase()) {
      throw new ForbiddenException(
        `ISSUER_PRIVATE_KEY wallet (${issuerWallet}) does not match caller's bound wallet (${callerWallet})`,
      );
    }

    // --- 4. ISSUER_ROLE check ----------------------------------------------
    await this.assertIssuerRole(issuerWallet);

    // --- 5. Generate PDF certificate (NO client-supplied hash) --------------
    let pdfBuffer: Buffer;
    try {
      pdfBuffer = await this.pdfService.generateCertificate({
        organization: {
          name: organization.name,
          code: organization.code,
          address: organization.address,
        },
        student: {
          full_name: dto.certificate_metadata.holder_full_name,
          student_code: dto.certificate_metadata.student_code ?? null,
        },
        certificateCode: certCode,
        expires_at: formatVietnamTime(dto.expires_at) ?? null,
        metadata: {
          program_name: dto.certificate_metadata.program_name,
          major: dto.certificate_metadata.major ?? null,
          degree_type: dto.certificate_metadata.degree_type ?? null,
          classification: dto.certificate_metadata.classification ?? null,
          gpa: dto.certificate_metadata.gpa ?? null,
          graduation_year: dto.certificate_metadata.graduation_year ?? null,
          issue_decision_number:
            dto.certificate_metadata.issue_decision_number ?? null,
          issue_date: dto.certificate_metadata.issue_date ?? null,
        },
      });
    } catch (err) {
      throw err;
    }

    // --- 6. SHA-256(PDF) -> document_hash (bytes32) -----------------------
    const documentHashHex =
      '0x' +
      createHash('sha256')
        .update(pdfBuffer)
        .digest('hex');
    const documentHashBytes32 = requireBytes32(documentHashHex);
    if (!documentHashBytes32) {
      throw new InternalServerErrorException(
        `Computed SHA-256 did not produce a valid bytes32: ${documentHashHex}`,
      );
    }
    this.logger.log(
      `Generated PDF (${pdfBuffer.length} bytes) and document_hash=${documentHashBytes32} for ${certCode}`,
    );

    // --- 7. Pre-flight on-chain uniqueness (now we have doc hash + cid path) -
    let usedOnChain: boolean;
    try {
      usedOnChain =
        await this.blockchain.managerContract.certificateCodeUsed(codeHashHex);
    } catch (err) {
      throw new ServiceUnavailableException(
        `Could not reach CertificateManager.certificateCodeUsed: ${(err as Error).message}`,
      );
    }
    if (usedOnChain) {
      throw new ConflictException('certificate_code already used on-chain');
    }

    // --- 8. Upload PDF to Pinata (CID_PDF -> document_uri) ------------------
    const documentFilename = `${certCode}.pdf`;
    let documentUri: string;
    try {
      documentUri = await this.pinata.uploadFile(
        documentFilename,
        pdfBuffer,
        'application/pdf',
      );
    } catch (err) {
      // Per spec: do not send blockchain transaction if Pinata upload fails.
      throw err;
    }
    const documentIpfsCid = extractIpfsCid(documentUri);

    // --- 9. Upload certificate_metadata JSON to Pinata (CID_METADATA) -------
    const metadataPayload = this.buildMetadataForIpfs(
      certCode,
      documentHashBytes32,
      dto,
      organizationId,
      caller.id,
      holder,
      documentUri,
      documentIpfsCid,
    );
    let metadataUri: string;
    try {
      metadataUri = await this.pinata.uploadJson(
        `${certCode}.metadata.json`,
        metadataPayload,
      );
    } catch (err) {
      throw err;
    }
    const metadataIpfsCid = extractIpfsCid(metadataUri);

    // --- 10. Build EIP-1559 tx skeleton ------------------------------------
    const iface = this.blockchain.managerContract.interface;
    const data = iface.encodeFunctionData('issueCertificate', [
      holder.wallet_address,
      codeHashHex,
      documentHashBytes32,
      expiresAt,
      metadataUri,
    ]);

    const nonce = await this.blockchain.provider.getTransactionCount(
      issuerWallet,
      'pending',
    );

    let feeData: ethers.FeeData;
    try {
      feeData = await this.blockchain.provider.getFeeData();
    } catch (err) {
      throw new ServiceUnavailableException(
        `Could not fetch fee data: ${(err as Error).message}`,
      );
    }

    const maxPriorityFeePerGas =
      feeData.maxPriorityFeePerGas ?? 1_500_000n; // 1.5 gwei fallback
    const baseFee = feeData.maxFeePerGas ?? feeData.gasPrice ?? 30_000_000n;
    const maxFeePerGas = baseFee + maxPriorityFeePerGas;

    let estimatedGas: bigint;
    try {
      estimatedGas =
        await this.blockchain.managerContract.issueCertificate.estimateGas(
          holder.wallet_address,
          codeHashHex,
          documentHashBytes32,
          expiresAt,
          metadataUri,
          { from: issuerWallet },
        );
    } catch (err) {
      throw mapBlockchainError(err);
    }
    const gasLimit = (estimatedGas * BigInt(10000 + GAS_BUFFER_BPS)) / 10000n;

    const txRequest: ethers.TransactionRequest = {
      to: CERTIFICATE_MANAGER_ADDRESS,
      data,
      value: 0n,
      chainId: CHAIN_ID,
      nonce,
      gasLimit,
      maxFeePerGas,
      maxPriorityFeePerGas,
      type: 2,
    };

    // --- 11. Sign + send ---------------------------------------------------
    let txResponse: ethers.TransactionResponse;
    try {
      const signed = await issuerAccount.signTransaction(txRequest);
      txResponse = await this.blockchain.provider.broadcastTransaction(
        signed,
      );
    } catch (err) {
      throw mapBlockchainError(err);
    }

    // --- 12. Wait for receipt ----------------------------------------------
    let receipt: ethers.TransactionReceipt | null;
    try {
      receipt = await this.blockchain.provider.waitForTransaction(
        txResponse.hash,
        CONFIRMATIONS,
        120_000,
      );
    } catch (err) {
      throw new BadGatewayException(
        `tx=${txResponse.hash} broadcast but confirmations failed: ${(err as Error).message}`,
      );
    }
    if (!receipt) {
      throw new BadGatewayException(
        `tx=${txResponse.hash} broadcast but no receipt`,
      );
    }
    if (receipt.status !== 1) {
      throw new BadGatewayException(
        `Blockchain transaction reverted (tx=${txResponse.hash})`,
      );
    }

    // --- 13. Parse CertificateIssued ---------------------------------------
    const issued = findCertificateIssuedEvent(receipt);
    if (!issued) {
      throw new InternalServerErrorException(
        `CertificateIssued event not found in receipt logs of tx=${txResponse.hash}`,
      );
    }
    if (issued.issuer.toLowerCase() !== issuerWallet.toLowerCase()) {
      throw new InternalServerErrorException(
        `Event issuer (${issued.issuer}) does not match signer (${issuerWallet})`,
      );
    }

    // --- 14. Resolve block timestamp --------------------------------------
    let block: ethers.Block | null;
    try {
      block = await this.blockchain.provider.getBlock(receipt.blockNumber);
    } catch (err) {
      throw new BadGatewayException(
        `Cannot fetch block ${receipt.blockNumber} for tx=${txResponse.hash}: ${(err as Error).message}`,
      );
    }
    if (!block) {
      throw new BadGatewayException(
        `Block ${receipt.blockNumber} not found for tx=${txResponse.hash}`,
      );
    }
    const issuedAt = new Date(Number(block.timestamp) * 1000);
    const expiresAtDate =
      expiresAt === 0 ? null : new Date(expiresAt * 1000);

    // --- 15. Persist (single DB transaction) ------------------------------
    try {
      const safeReceipt = receipt;
      const cert = await this.prisma.$transaction(async (tx) => {
        const created = await tx.certificates.create({
          data: {
            token_id: issued.tokenId,
            chain_id: CHAIN_ID,
            contract_address: CERTIFICATE_MANAGER_ADDRESS,
            certificate_code_hash: issued.certificateCodeHash,
            document_hash: issued.documentHash,
            certificate_code: certCode,
            holder_user_id: holder.id,
            holder_wallet_address: issued.holder.toLowerCase(),
            organization_id: organizationId,
            issuer_user_id: caller.id,
            issuer_wallet_address: issued.issuer.toLowerCase(),
            issued_at: issuedAt,
            expires_at: expiresAtDate,
            status: 'Active',
            metadata_uri: metadataUri,
            metadata_ipfs_cid: metadataIpfsCid,
            document_uri: documentUri,
            document_ipfs_cid: documentIpfsCid,
          },
          select: {
            id: true,
            token_id: true,
            status: true,
          },
        });

        await tx.certificate_events.create({
          data: {
            certificate_id: created.id,
            token_id: issued.tokenId,
            event_type: 'Issued',
            tx_hash: txResponse.hash,
            block_number: safeReceipt.blockNumber,
            block_timestamp: issuedAt,
            log_index: issued.logIndex,
            chain_id: CHAIN_ID,
            actor_wallet_address: issued.issuer.toLowerCase(),
            actor_user_id: caller.id,
            reason: null,
            payload: {
              args: {
                holder: issued.holder,
                certificateCodeHash: issued.certificateCodeHash,
                documentHash: issued.documentHash,
                expiresAt: Number(issued.expiresAt),
              },
              document_uri: documentUri,
              metadata_uri: metadataUri,
            },
          },
        });

        if (dto.certificate_metadata) {
          await tx.certificate_metadata.create({
            data: {
              certificate_id: created.id,
              ...this.mapMetadata(dto.certificate_metadata),
              metadata_json: metadataPayload as unknown as Prisma.InputJsonValue,
              metadata_ipfs_hash: metadataIpfsCid ?? undefined,
              metadata_pinned_at: new Date(),
            },
          });
        }

        return created;
      });

      return {
        certificate_id: cert.id,
        token_id: cert.token_id.toString(),
        tx_hash: txResponse.hash,
        block_number: Number(safeReceipt.blockNumber),
        block_timestamp: issuedAt,
        certificate_code: certCode,

        holder_user_id: holder.id,
        holder_wallet_address: issued.holder.toLowerCase(),
        organization_id: organizationId,
        issuer_user_id: caller.id,
        issuer_wallet_address: issued.issuer.toLowerCase(),
        contract_address: CERTIFICATE_MANAGER_ADDRESS,
        chain_id: CHAIN_ID,

        document_hash: issued.documentHash,
        document_ipfs_cid: documentIpfsCid,
        document_uri: toIpfsGatewayUrl(documentUri),

        metadata_ipfs_cid: metadataIpfsCid,
        metadata_uri: toIpfsGatewayUrl(metadataUri),

        status: cert.status,
        issued_at: issuedAt,
        expires_at: expiresAtDate,
      };
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException(
          `certificate_code already recorded (race with another tx; chain tx=${txResponse.hash})`,
        );
      }
      this.logger.error(
        `DB write failed AFTER successful chain tx=${txResponse.hash} (tokenId=${issued.tokenId.toString()}). document_ipfs_cid=${documentIpfsCid} metadata_ipfs_cid=${metadataIpfsCid} document_uri=${documentUri} metadata_uri=${metadataUri}: ${(err as Error).message}`,
        (err as Error).stack,
      );
      throw new InternalServerErrorException(
        `Persisted chain tx=${txResponse.hash} but DB write failed: ${(err as Error).message}. The chain tx is final; reconcile manually.`,
      );
    }
  }

  async revoke(
    dto: RevokeCertificateDto,
    caller: SchoolAdminCaller,
  ): Promise<RevokedCertificateResult> {
    this.assertRevokeAuthorized(caller);
    this.assertIssuerKeyConfigured();
    this.assertContractConfigured();

    // --- 1. Validate token_id ----------------------------------------------
    if (!/^\d+$/.test(dto.token_id)) {
      throw new BadRequestException('token_id must be a numeric string');
    }
    const tokenId = BigInt(dto.token_id);

    // --- 2. Compute reason hash --------------------------------------------
    const reasonText = dto.reason.trim();
    const reasonHashHex = ethers.keccak256(
      ethers.toUtf8Bytes(reasonText),
    ) as `0x${string}`;

    // --- 3. Resolve DB record ----------------------------------------------
    const cert = await this.prisma.certificates.findFirst({
      where: {
        chain_id: CHAIN_ID,
        contract_address: CERTIFICATE_MANAGER_ADDRESS,
        token_id: tokenId,
      },
      select: {
        id: true,
        token_id: true,
        certificate_code: true,
        document_hash: true,
        organization_id: true,
        issuer_user_id: true,
        issuer_wallet_address: true,
        revoked_at: true,
        revocation_reason_hash: true,
        status: true,
      },
    });

    if (!cert) {
      throw new NotFoundException(
        `Certificate with token_id '${dto.token_id}' not found in DB`,
      );
    }

    // School admin chỉ được thu hồi chứng chỉ trong cùng tổ chức của họ
    if (
      caller.role === UserRole.SCHOOL_ADMIN &&
      cert.organization_id !== caller.organization_id
    ) {
      throw new ForbiddenException(
        'You can only revoke certificates in your organization',
      );
    }

    if (cert.revoked_at !== null) {
      throw new ConflictException(
        `Certificate already revoked at ${cert.revoked_at.toISOString()}`,
      );
    }

    // --- 4. Issuer wallet from ISSUER_PRIVATE_KEY ---------------------------
    const issuerAccount = new ethers.Wallet(ISSUER_PRIVATE_KEY, this.blockchain.provider);
    const issuerWallet = normalizeAddress(issuerAccount.address);
    if (!issuerWallet) {
      throw new InternalServerErrorException(
        'ISSUER_PRIVATE_KEY did not derive a valid address',
      );
    }

    // For non-admin callers, the env wallet must match the original issuer wallet.
    if (caller.role !== UserRole.SUPER_ADMIN) {
      const onChainCert =
        await this.blockchain.managerContract.getCertificate(tokenId);
      if (
        onChainCert.issuer.toLowerCase() !==
        issuerWallet.toLowerCase()
      ) {
        throw new ForbiddenException(
          'Revoke requires the original issuer wallet (ISSUER_PRIVATE_KEY does not match on-chain issuer)',
        );
      }
    }

    // --- 5. Build EIP-1559 tx skeleton -------------------------------------
    const iface = this.blockchain.managerContract.interface;
    const data = iface.encodeFunctionData('revokeCertificate', [
      tokenId,
      reasonHashHex,
    ]);

    const nonce = await this.blockchain.provider.getTransactionCount(
      issuerWallet,
      'pending',
    );

    let feeData: ethers.FeeData;
    try {
      feeData = await this.blockchain.provider.getFeeData();
    } catch (err) {
      throw new ServiceUnavailableException(
        `Could not fetch fee data: ${(err as Error).message}`,
      );
    }

    const maxPriorityFeePerGas =
      feeData.maxPriorityFeePerGas ?? 1_500_000n; // 1.5 gwei fallback
    const baseFee = feeData.maxFeePerGas ?? feeData.gasPrice ?? 30_000_000n;
    const maxFeePerGas = baseFee + maxPriorityFeePerGas;

    let estimatedGas: bigint;
    try {
      estimatedGas =
        await this.blockchain.managerContract.revokeCertificate.estimateGas(
          tokenId,
          reasonHashHex,
          { from: issuerWallet },
        );
    } catch (err) {
      throw mapBlockchainError(err);
    }
    const gasLimit = (estimatedGas * BigInt(10000 + GAS_BUFFER_BPS)) / 10000n;

    const txRequest: ethers.TransactionRequest = {
      to: CERTIFICATE_MANAGER_ADDRESS,
      data,
      value: 0n,
      chainId: CHAIN_ID,
      nonce,
      gasLimit,
      maxFeePerGas,
      maxPriorityFeePerGas,
      type: 2,
    };

    // --- 6. Sign + send ----------------------------------------------------
    let txResponse: ethers.TransactionResponse;
    try {
      const signed = await issuerAccount.signTransaction(txRequest);
      txResponse = await this.blockchain.provider.broadcastTransaction(
        signed,
      );
    } catch (err) {
      throw mapBlockchainError(err);
    }

    // --- 7. Wait for receipt ----------------------------------------------
    let receipt: ethers.TransactionReceipt | null;
    try {
      receipt = await this.blockchain.provider.waitForTransaction(
        txResponse.hash,
        CONFIRMATIONS,
        120_000,
      );
    } catch (err) {
      throw new BadGatewayException(
        `tx=${txResponse.hash} broadcast but confirmations failed: ${(err as Error).message}`,
      );
    }
    if (!receipt) {
      throw new BadGatewayException(
        `tx=${txResponse.hash} broadcast but no receipt`,
      );
    }
    if (receipt.status !== 1) {
      throw new BadGatewayException(
        `Blockchain transaction reverted (tx=${txResponse.hash})`,
      );
    }

    // --- 8. Parse CertificateRevoked event (with reconciliation fallback) -
    let revoked = findCertificateRevokedEvent(receipt);
    let chainReasonHash: string | null = null;
    let revokedAt: Date | null = null;
    let revokedLogIndex: number | null = null;
    let parsedOk = false;

    if (revoked) {
      parsedOk = true;
      if (revoked.tokenId !== tokenId) {
        throw new InternalServerErrorException(
          `Event tokenId (${revoked.tokenId.toString()}) does not match target (${tokenId.toString()})`,
        );
      }
      if (revoked.revokedBy.toLowerCase() !== issuerWallet.toLowerCase()) {
        throw new InternalServerErrorException(
          `Event revokedBy (${revoked.revokedBy}) does not match signer (${issuerWallet})`,
        );
      }
      chainReasonHash = revoked.reasonHash.toLowerCase();
      revokedLogIndex = revoked.logIndex;
    } else {
      this.logger.warn(
        `CertificateRevoked event not found in receipt logs of tx=${txResponse.hash}; falling back to on-chain state`,
      );
    }

    // --- 9. Resolve block timestamp --------------------------------------
    let block: ethers.Block | null;
    try {
      block = await this.blockchain.provider.getBlock(receipt.blockNumber);
    } catch (err) {
      throw new BadGatewayException(
        `Cannot fetch block ${receipt.blockNumber} for tx=${txResponse.hash}: ${(err as Error).message}`,
      );
    }
    if (!block) {
      throw new BadGatewayException(
        `Block ${receipt.blockNumber} not found for tx=${txResponse.hash}`,
      );
    }

    if (parsedOk) {
      revokedAt = new Date(Number(block.timestamp) * 1000);
    } else {
      let onChainCert: {
        certificateCodeHash: string;
        documentHash: string;
        issuer: string;
        issuedAt: bigint;
        expiresAt: bigint;
        revokedAt: bigint;
        previousTokenId: bigint;
        replacementTokenId: bigint;
        status: bigint | number;
        revocationReasonHash: string;
      };
      try {
        onChainCert =
          (await this.blockchain.managerContract.getCertificate(tokenId)) as {
            certificateCodeHash: string;
            documentHash: string;
            issuer: string;
            issuedAt: bigint;
            expiresAt: bigint;
            revokedAt: bigint;
            previousTokenId: bigint;
            replacementTokenId: bigint;
            status: bigint | number;
            revocationReasonHash: string;
          };
      } catch (err) {
        throw new BadGatewayException(
          `Could not reconcile on-chain state after missing event for tx=${txResponse.hash}: ${(err as Error).message}`,
        );
      }

      const onChainStatus = Number(onChainCert.status);
      const onChainRevokedAtSec = Number(onChainCert.revokedAt);
      const onChainRevoked =
        onChainStatus === 1 /* Revoked */ && onChainRevokedAtSec > 0;

      if (!onChainRevoked) {
        throw new InternalServerErrorException(
          `CertificateRevoked event missing AND on-chain state for tokenId=${tokenId.toString()} does not show Revoked (status=${onChainStatus}, revokedAt=${onChainRevokedAtSec}) (tx=${txResponse.hash}); manual reconciliation required`,
        );
      }

      chainReasonHash = String(onChainCert.revocationReasonHash ?? '').toLowerCase();
      revokedAt = new Date(onChainRevokedAtSec * 1000);
      revokedLogIndex = -1;

      this.logger.log(
        `Reconciled revoke from on-chain state for tx=${txResponse.hash} tokenId=${tokenId.toString()}`,
      );
    }

    // --- 10. Persist (single DB transaction) -----------------------------
    try {
      const safeReceipt = receipt;
      const updated = await this.prisma.$transaction(async (tx) => {
        const upd = await tx.certificates.update({
          where: { id: cert.id },
          data: {
            status: 'Revoked',
            revoked_at: revokedAt,
            revoked_by_wallet: issuerWallet.toLowerCase(),
            revocation_reason_hash: chainReasonHash,
            updated_at: revokedAt,
          },
          select: {
            id: true,
            token_id: true,
            status: true,
          },
        });

        await tx.certificate_events.create({
          data: {
            certificate_id: upd.id,
            token_id: upd.token_id,
            event_type: 'Revoked',
            tx_hash: txResponse.hash,
            block_number: safeReceipt.blockNumber,
            block_timestamp: revokedAt,
            log_index: revokedLogIndex ?? -1,
            chain_id: CHAIN_ID,
            actor_wallet_address: issuerWallet.toLowerCase(),
            actor_user_id: caller.id,
            reason: reasonText,
            reason_hash: chainReasonHash,
            payload: {
              args: {
                reasonHash: chainReasonHash,
              },
              reconciled: !parsedOk,
            },
          },
        });

        return upd;
      });

      return {
        certificate_id: updated.id,
        token_id: updated.token_id.toString(),
        tx_hash: txResponse.hash,
        block_number: Number(receipt.blockNumber),
        block_timestamp: revokedAt,
        certificate_code: cert.certificate_code,
        document_hash: cert.document_hash,
        organization_id: cert.organization_id,
        issuer_user_id: cert.issuer_user_id,
        revoked_by_wallet_address: issuerWallet.toLowerCase(),
        revocation_reason_hash: chainReasonHash,
        status: updated.status,
        revoked_at: revokedAt,
      };
    } catch (err) {
      this.logger.error(
        `DB write failed AFTER successful revoke chain tx=${txResponse.hash} (tokenId=${tokenId.toString()}): ${(err as Error).message}`,
        (err as Error).stack,
      );
      throw new InternalServerErrorException(
        `Persisted chain tx=${txResponse.hash} but DB write failed: ${(err as Error).message}. The chain tx is final; reconcile manually.`,
      );
    }
  }

  // ------------------------------------------------------------------
  // helpers
  // ------------------------------------------------------------------

  private assertRevokeAuthorized(caller: SchoolAdminCaller): void {
    if (
      caller.role !== UserRole.SCHOOL_ADMIN &&
      caller.role !== UserRole.SUPER_ADMIN
    ) {
      throw new ForbiddenException(
        'Only school_admin or super_admin can revoke certificates',
      );
    }
  }

  private assertSchoolAdmin(caller: SchoolAdminCaller): void {
    if (caller.role !== UserRole.SCHOOL_ADMIN) {
      throw new ForbiddenException('Only school_admin can issue certificates');
    }
  }

  private assertIssuerKeyConfigured(): void {
    if (!ISSUER_PRIVATE_KEY) {
      throw new InternalServerErrorException(
        'ISSUER_PRIVATE_KEY is not set in environment',
      );
    }
  }

  private assertContractConfigured(): void {
    if (!CERTIFICATE_MANAGER_ADDRESS) {
      throw new InternalServerErrorException(
        'CERTIFICATE_MANAGER_ADDRESS is not set in environment',
      );
    }
  }

  // tìm user từ DB, phải là STUDENT và đã bind wallet
  private async loadHolder(holderUserId: number): Promise<{
    id: number;
    role: string;
    organization_id: number | null;
    wallet_address: string;
  }> {
    const u = await this.prisma.users.findUnique({
      where: { id: holderUserId },
      select: {
        id: true,
        role: true,
        organization_id: true,
        wallet_address: true,
        is_deleted: true,
      },
    });
    if (!u || u.is_deleted) {
      throw new NotFoundException(`holder user ${holderUserId} not found`);
    }
    if (u.role !== UserRole.STUDENT) {
      throw new BadRequestException(
        `holder user ${holderUserId} is not a student (role=${u.role})`,
      );
    }
    const wallet = normalizeAddress(u.wallet_address);
    if (!wallet) {
      throw new BadRequestException(
        `holder user ${holderUserId} has no wallet_address bound`,
      );
    }
    return {
      id: u.id,
      role: u.role,
      organization_id: u.organization_id,
      wallet_address: wallet,
    };
  }

  private assertSameOrganization(
    holder: { organization_id: number | null },
    callerOrganizationId: number,
  ): void {
    if (
      holder.organization_id === null ||
      holder.organization_id !== callerOrganizationId
    ) {
      throw new ForbiddenException(
        'You can only issue certificates to students in your organization',
      );
    }
  }

  private async assertIssuerRole(wallet: string): Promise<void> {
    if (!ISSUER_ROLE) {
      throw new InternalServerErrorException('ISSUER_ROLE env not configured');
    }
    const role = await this.blockchain.managerContract.ISSUER_ROLE();
    const ok: boolean = await this.blockchain.managerContract.hasRole(
      role,
      wallet,
    );
    if (!ok) {
      throw new ForbiddenException(
        `Issuer wallet ${wallet} does not have ISSUER_ROLE on CertificateManager`,
      );
    }
  }

  private mapMetadata(m: CertificateMetadataPayloadDto): {
    holder_full_name: string;
    student_code?: string;
    program_name: string;
    major?: string;
    degree_type?: string;
    classification?: string;
    gpa?: Prisma.Decimal;
    graduation_year?: number;
    issue_decision_number?: string;
    issue_date?: Date;
  } {
    const issueDate = m.issue_date ? new Date(m.issue_date) : undefined;
    return {
      holder_full_name: m.holder_full_name,
      student_code: m.student_code,
      program_name: m.program_name,
      major: m.major,
      degree_type: m.degree_type,
      classification: m.classification,
      gpa: m.gpa === undefined ? undefined : new Prisma.Decimal(m.gpa),
      graduation_year: m.graduation_year,
      issue_decision_number: m.issue_decision_number,
      issue_date:
        issueDate && !Number.isNaN(issueDate.getTime()) ? issueDate : undefined,
    };
  }

  /**
   * Builds a JSON document describing the certificate. The actual upload to
   * IPFS via Pinata happens at the call site after the PDF is uploaded, so
   * we keep both CIDs available to include them in the canonical metadata
   * that goes on-chain via `metadataURI`.
   */
  private buildMetadataForIpfs(
    certificateCode: string,
    documentHashHex: string,
    dto: IssueCertificateDto,
    organizationId: number,
    issuerUserId: number,
    holder: { id: number; wallet_address: string },
    documentUri: string,
    documentIpfsCid: string | null,
  ): Record<string, unknown> {
    return {
      name: `Certificate ${certificateCode}`,
      description: 'Academic certificate metadata anchored on-chain',
      certificate_code: certificateCode,
      document_hash: documentHashHex,
      document_uri: documentUri,
      document_ipfs_cid: documentIpfsCid,
      expires_at: dto.expires_at ?? null,
      organization_id: organizationId,
      issuer: {
        user_id: issuerUserId,
      },
      holder: {
        user_id: holder.id,
        wallet_address: holder.wallet_address,
      },
      attributes: this.buildMetadataAttributes(dto.certificate_metadata),
    };
  }

  private buildMetadataAttributes(
    m: CertificateMetadataPayloadDto,
  ): Record<string, string | number | null> {
    return {
      holder_full_name: m.holder_full_name,
      student_code: m.student_code ?? null,
      program_name: m.program_name,
      major: m.major ?? null,
      degree_type: m.degree_type ?? null,
      classification: m.classification ?? null,
      gpa: m.gpa ?? null,
      graduation_year: m.graduation_year ?? null,
      issue_decision_number: m.issue_decision_number ?? null,
      issue_date: m.issue_date ?? null,
    };
  }
}