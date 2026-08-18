import { ethers } from 'ethers';
import CertificateManagerAbi from '../../../modules-system/blockchain/abi/CertificateManager.json';

const ISSUE_IFACE = new ethers.Interface(
  (CertificateManagerAbi as { abi: ethers.InterfaceAbi }).abi,
);

export interface CertificateIssuedEventArgs {
  tokenId: bigint;
  holder: string;
  issuer: string;
  certificateCodeHash: string;
  documentHash: string;
  expiresAt: bigint;
}

export interface ParsedCertificateIssuedEvent extends CertificateIssuedEventArgs {
  logIndex: number;
}

export interface CertificateRevokedEventArgs {
  tokenId: bigint;
  revokedBy: string;
  reasonHash: string;
}

export interface ParsedCertificateRevokedEvent extends CertificateRevokedEventArgs {
  logIndex: number;
}

/**
 * Parse a CertificateIssued event log from a transaction receipt.
 * Returns the typed event args + the actual logIndex, or null if no matching log was found.
 */
export function findCertificateIssuedEvent(
  receipt: ethers.TransactionReceipt,
): ParsedCertificateIssuedEvent | null {
  for (const log of receipt.logs) {
    try {
      const parsed = ISSUE_IFACE.parseLog({
        topics: [...log.topics],
        data: log.data,
      });
      if (parsed?.name === 'CertificateIssued') {
        const [tokenId, holder, issuer, certificateCodeHash, documentHash, expiresAt] =
          parsed.args;
        return {
          tokenId: BigInt(tokenId.toString()),
          holder: ethers.getAddress(holder),
          issuer: ethers.getAddress(issuer),
          certificateCodeHash: certificateCodeHash.toLowerCase(),
          documentHash: documentHash.toLowerCase(),
          expiresAt: BigInt(expiresAt.toString()),
          logIndex: log.index,
        };
      }
    } catch {
      // not our event, skip
    }
  }
  return null;
}

export function findCertificateRevokedEvent(
  receipt: ethers.TransactionReceipt,
): ParsedCertificateRevokedEvent | null {
  for (const log of receipt.logs) {
    try {
      const parsed = ISSUE_IFACE.parseLog({
        topics: [...log.topics],
        data: log.data,
      });
      if (parsed?.name === 'CertificateRevoked') {
        const [tokenId, revokedBy, reasonHash] = parsed.args;
        return {
          tokenId: BigInt(tokenId.toString()),
          revokedBy: ethers.getAddress(revokedBy),
          reasonHash: reasonHash.toLowerCase(),
          logIndex: log.index,
        };
      }
    } catch {
      // not our event, skip
    }
  }
  return null;
}