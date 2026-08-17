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
import { ethers } from 'ethers';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../modules-system/prisma/prisma.service';
import { BlockchainService } from '../../modules-system/blockchain/blockchain.service';
import {
  CERTIFICATE_MANAGER_ADDRESS,
  CHAIN_ID,
  ISSUER_PRIVATE_KEY,
  ISSUER_ROLE,
} from '../../../common/constant/app.constant';
import { UserRole } from '../../../common/enums/user-role.enum';

import {
  CertificateMetadataPayloadDto,
  IssueCertificateDto,
} from './dto/issue-certificate.dto';
import { findCertificateIssuedEvent } from './helpers/event-parser';
import {
  extractIpfsCid,
  normalizeAddress,
  normalizeCertificateCode,
  normalizeMetadataUri,
  requireBytes32,
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
  metadata_uri: string;
  status: string;
  issued_at: Date;
  expires_at: Date | null;
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
      metadata_uri: cert.metadata_uri,
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

    // Lấy tx_hash từ certificate_events thay vì query blockchain event
    const issuedEvent = await this.prisma.certificate_events.findFirst({
      where: {
        certificate_id: cert.id,
        event_type: 'Issued',
      },
      select: {
        tx_hash: true,
      },
    });

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
      metadata_uri: cert.metadata_uri,
      on_chain_issued_at: onChainCert.issuedAt.toString(),
      on_chain_expires_at: onChainCert.expiresAt.toString(),
      on_chain_revoked_at: onChainCert.revokedAt.toString(),
      on_chain_status: onChainCert.status,
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

    const docHashHex = requireBytes32(dto.document_hash);
    if (!docHashHex) {
      throw new BadRequestException(
        'document_hash must be 0x followed by exactly 64 hex chars',
      );
    }

    const metadataUri = normalizeMetadataUri(dto.metadata_uri);
    if (!metadataUri) {
      throw new BadRequestException(
        'metadata_uri must start with http(s)://, ipfs://, ar://, or data:',
      );
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
    // check nếu user cùng org với school_admin
    this.assertSameOrganization(holder, organizationId);

    // --- 3. Pre-flight on-chain uniqueness ----------------------------------
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

    // --- 4. Pre-flight DB uniqueness ----------------------------------------
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

    // --- 5. Issuer wallet from ISSUER_PRIVATE_KEY ---------------------------
    const issuerAccount = new ethers.Wallet(ISSUER_PRIVATE_KEY, this.blockchain.provider);
    const issuerWallet = normalizeAddress(issuerAccount.address);
    if (!issuerWallet) {
      throw new InternalServerErrorException(
        'ISSUER_PRIVATE_KEY did not derive a valid address',
      );
    }

    // Sanity check: env wallet must match caller's bound wallet if present.
    const callerWallet = normalizeAddress(caller.wallet_address);
    if (callerWallet && callerWallet.toLowerCase() !== issuerWallet.toLowerCase()) {
      throw new ForbiddenException(
        `ISSUER_PRIVATE_KEY wallet (${issuerWallet}) does not match caller's bound wallet (${callerWallet})`,
      );
    }

    // --- 6. ISSUER_ROLE check ----------------------------------------------
    await this.assertIssuerRole(issuerWallet);

    // --- 7. Build EIP-1559 tx skeleton -------------------------------------
    const iface = this.blockchain.managerContract.interface;
    const data = iface.encodeFunctionData('issueCertificate', [
      holder.wallet_address,
      codeHashHex,
      docHashHex,
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
          docHashHex,
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

    // --- 8. Sign + send ----------------------------------------------------
    let txResponse: ethers.TransactionResponse;
    try {
      const signed = await issuerAccount.signTransaction(txRequest);
      txResponse = await this.blockchain.provider.broadcastTransaction(
        signed,
      );
    } catch (err) {
      throw mapBlockchainError(err);
    }

    // --- 9. Wait for receipt ----------------------------------------------
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

    // --- 10. Parse CertificateIssued ---------------------------------------
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

    // --- 11. Resolve block timestamp --------------------------------------
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

    // --- 12. Persist (single DB transaction) ------------------------------
    const ipfsCid = extractIpfsCid(metadataUri);

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
            metadata_ipfs_cid: ipfsCid,
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
            payload: {
              args: {
                holder: issued.holder,
                certificateCodeHash: issued.certificateCodeHash,
                documentHash: issued.documentHash,
                expiresAt: Number(issued.expiresAt),
              },
            } as Prisma.InputJsonValue,
          },
        });

        if (dto.certificate_metadata) {
          await tx.certificate_metadata.create({
            data: {
              certificate_id: created.id,
              ...this.mapMetadata(dto.certificate_metadata),
              metadata_ipfs_hash: ipfsCid ?? undefined,
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
        metadata_uri: metadataUri,
        status: cert.status,
        issued_at: issuedAt,
        expires_at: expiresAtDate,
      };
    } catch (err) {
      // Chain tx succeeded, DB write failed. We cannot rollback the chain.
      // Log clearly so the tx_hash is recoverable for manual reconciliation.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException(
          `certificate_code already recorded (race with another tx; chain tx=${txResponse.hash})`,
        );
      }
      this.logger.error(
        `DB write failed AFTER successful chain tx=${txResponse.hash} (tokenId=${issued.tokenId.toString()}): ${(err as Error).message}`,
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
      gpa: m.gpa !== undefined ? new Prisma.Decimal(m.gpa) : undefined,
      graduation_year: m.graduation_year,
      issue_decision_number: m.issue_decision_number,
      issue_date:
        issueDate && !Number.isNaN(issueDate.getTime()) ? issueDate : undefined,
    };
  }
}