import {
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { PinataSDK } from 'pinata';
import { PINATA_GATEWAY, PINATA_JWT } from '../../../common/constant/app.constant';

@Injectable()
export class PinataService implements OnModuleInit {
  private readonly logger = new Logger(PinataService.name);
  private sdk: PinataSDK | null = null;

  onModuleInit(): void {
    if (!PINATA_JWT) {
      this.logger.warn(
        'PINATA_JWT is not set. PinataService will throw on upload until it is configured.',
      );
      return;
    }
    try {
      this.sdk = new PinataSDK({
        pinataJwt: PINATA_JWT,
        pinataGateway: PINATA_GATEWAY || undefined,
      });
      this.logger.log('PinataSDK initialized');
    } catch (err) {
      this.logger.error(
        `Failed to initialize PinataSDK: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Upload a JSON object to IPFS via Pinata public network.
   * Returns the IPFS URI in the form `ipfs://<cid>`.
   */
  async uploadJson(
    name: string,
    data: Record<string, unknown>,
  ): Promise<string> {
    if (!this.sdk) {
      throw new InternalServerErrorException(
        'PinataService is not configured (PINATA_JWT missing)',
      );
    }
    try {
      const result = await this.sdk.upload.public.json(data, {
        metadata: { name },
      });
      if (!result?.cid) {
        throw new InternalServerErrorException(
          'Pinata upload returned no CID',
        );
      }
      return `ipfs://${result.cid}`;
    } catch (err) {
      throw new InternalServerErrorException(
        `Pinata upload failed: ${(err as Error).message}`,
      );
    }
  }
}
