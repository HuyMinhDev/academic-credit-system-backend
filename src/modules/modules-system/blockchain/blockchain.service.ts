import {
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ethers } from 'ethers';
import {
  BLOCKCHAIN_RPC_URL,
  CERTIFICATE_MANAGER_ADDRESS,
  CERTIFICATE_TOKEN_ADDRESS,
  CHAIN_ID,
  assertIssuerPrivateKeyConfigured,
} from '../../../common/constant/app.constant';

import CertificateManagerAbi from './abi/CertificateManager.json';
import CertificateTokenAbi from './abi/CertificateToken.json';

export interface BlockchainConnectionInfo {
  chainId: number;
  chainIdMatches: boolean;
  blockNumber: number;
  managerAddress: string;
  managerCodeAt: string; 
  tokenAddress: string;
  tokenCodeAt: string;
  tokenName: string | null;
  tokenSymbol: string | null;
  providerReachable: boolean;
}

@Injectable()
export class BlockchainService implements OnModuleInit {
  private readonly logger = new Logger(BlockchainService.name);

  readonly provider: ethers.JsonRpcProvider;
  readonly managerContract: ethers.Contract;
  readonly tokenContract: ethers.Contract;

  constructor() {
    if (!BLOCKCHAIN_RPC_URL) {
      throw new InternalServerErrorException(
        'BLOCKCHAIN_RPC_URL is not set in environment',
      );
    }
    if (!CERTIFICATE_MANAGER_ADDRESS) {
      throw new InternalServerErrorException(
        'CERTIFICATE_MANAGER_ADDRESS is not set in environment',
      );
    }
    if (!CERTIFICATE_TOKEN_ADDRESS) {
      throw new InternalServerErrorException(
        'CERTIFICATE_TOKEN_ADDRESS is not set in environment',
      );
    }
    assertIssuerPrivateKeyConfigured();

    this.provider = new ethers.JsonRpcProvider(BLOCKCHAIN_RPC_URL, {
      chainId: CHAIN_ID,
      name: CHAIN_ID === 11155111 ? 'sepolia' : 'custom',
    });


    this.managerContract = new ethers.Contract(
      CERTIFICATE_MANAGER_ADDRESS,
      (CertificateManagerAbi as { abi: ethers.InterfaceAbi }).abi,
      this.provider,
    );

    this.tokenContract = new ethers.Contract(
      CERTIFICATE_TOKEN_ADDRESS,
      (CertificateTokenAbi as { abi: ethers.InterfaceAbi }).abi,
      this.provider,
    );
  }

  async onModuleInit(): Promise<void> {
    try {
      const info = await this.verifyConnection();
      this.logger.log(
        `Blockchain reachable: chainId=${info.chainId}, block=${info.blockNumber}, manager=${info.managerAddress}`,
      );
    } catch (err) {
      this.logger.warn(
        `Blockchain not reachable at startup: ${(err as Error).message}`,
      );
    }
  }


  async verifyConnection(): Promise<BlockchainConnectionInfo> {
    let providerReachable = true;
    let networkChainId: number | null = null;
    let blockNumber = 0;
    try {
      const network = await this.provider.getNetwork();
      networkChainId = Number(network.chainId);
      blockNumber = await this.provider.getBlockNumber();
    } catch (err) {
      providerReachable = false;
      this.logger.error(`provider.getNetwork() failed: ${(err as Error).message}`);
    }

    const chainIdMatches =
      networkChainId !== null && networkChainId === CHAIN_ID;

    // Lấy code tại address contract để xác nhận đã deploy.
    const [managerCodeAt, tokenCodeAt] = await Promise.all([
      providerReachable ? this.provider.getCode(CERTIFICATE_MANAGER_ADDRESS) : Promise.resolve('0x'),
      providerReachable ? this.provider.getCode(CERTIFICATE_TOKEN_ADDRESS) : Promise.resolve('0x'),
    ]);

    // Token name/symbol có thể fail nếu ABI stub chưa đúng format.
    let tokenName: string | null = null;
    let tokenSymbol: string | null = null;
    if (providerReachable && tokenCodeAt && tokenCodeAt !== '0x') {
      try {
        tokenName = await this.tokenContract.name();
      } catch {
        tokenName = null;
      }
      try {
        tokenSymbol = await this.tokenContract.symbol();
      } catch {
        tokenSymbol = null;
      }
    }

    return {
      chainId: networkChainId ?? CHAIN_ID,
      chainIdMatches,
      blockNumber,
      managerAddress: CERTIFICATE_MANAGER_ADDRESS,
      managerCodeAt,
      tokenAddress: CERTIFICATE_TOKEN_ADDRESS,
      tokenCodeAt,
      tokenName,
      tokenSymbol,
      providerReachable,
    };
  }
}
