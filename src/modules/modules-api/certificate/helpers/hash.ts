import { ethers } from 'ethers';

/**
 * Validate a 0x-prefixed 32-byte hex string (bytes32).
 * - Lowercase / uppercase accepted.
 * - Returns null if invalid.
 */
export function normalizeBytes32(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const v = input.trim();
  if (!/^0x[0-9a-fA-F]{64}$/.test(v)) return null;
  return v.toLowerCase() as `0x${string}`;
}

/**
 * Validate a 0x-prefixed 20-byte address (EIP-55 checksummed when returned).
 * Returns null if invalid.
 */
export function normalizeAddress(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const v = input.trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(v)) return null;
  try {
    return ethers.getAddress(v);
  } catch {
    return null;
  }
}

/**
 * Compute keccak256 of a string (UTF-8 bytes) and return 0x-prefixed hex.
 */
export function keccak256OfString(input: string): `0x${string}` {
  const bytes = ethers.toUtf8Bytes(input);
  const out = ethers.keccak256(bytes);
  return out as `0x${string}`;
}

/**
 * Compute keccak256 of an arbitrary bytes-like input (already 0x-prefixed hex,
 * or utf-8 string). Normalizes input first.
 */
export function keccak256OfDocumentHash(input: string): `0x${string}` {
  // Accept either:
  //   - 0x...   (caller already produced a hash)
  //   - raw string (we hash it ourselves, e.g. JSON.stringify(document))
  const v = input.trim();
  if (/^0x[0-9a-fA-F]+$/.test(v) && (v.length - 2) % 2 === 0) {
    return v as `0x${string}`;
  }
  return keccak256OfString(v);
}

/**
 * Strictly validate a bytes32 input ("0x" + 64 hex chars).
 * Returns the lowercase 0x-hex string, or null if invalid.
 * Use this when the contract requires a precomputed document hash.
 */
export function requireBytes32(input: string): `0x${string}` | null {
  const v = (input ?? '').trim();
  if (!/^0x[0-9a-fA-F]{64}$/.test(v)) return null;
  return v.toLowerCase() as `0x${string}`;
}

/**
 * Validate a certificate_code plaintext.
 * DB column is VarChar(100). We keep conservative bounds.
 */
export function normalizeCertificateCode(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const v = input.trim();
  if (v.length === 0 || v.length > 100) return null;
  return v;
}

/**
 * Validate a metadata URI. Accept http(s), ipfs://, ar://, data:.
 * DB column VarChar(500).
 */
export function normalizeMetadataUri(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const v = input.trim();
  if (v.length === 0 || v.length > 500) return null;
  if (
    !v.startsWith('http://') &&
    !v.startsWith('https://') &&
    !v.startsWith('ipfs://') &&
    !v.startsWith('ar://') &&
    !v.startsWith('data:')
  ) {
    return null;
  }
  return v;
}

/**
 * Pull the IPFS CID out of an `ipfs://CID/...` URI.
 * Returns null if not an IPFS URI.
 */
export function extractIpfsCid(metadataUri: string): string | null {
  if (!metadataUri.startsWith('ipfs://')) return null;
  const rest = metadataUri.slice('ipfs://'.length);
  // CIDv0 starts with Qm (base58), CIDv1 starts with b (base32).
  const m = /^([A-Za-z0-9]+)/.exec(rest);
  return m ? m[1] : null;
}
