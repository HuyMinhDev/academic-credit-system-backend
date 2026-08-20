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

  async uploadFile(
    filename: string,
    buffer: Buffer,
    mimeType = 'application/pdf',
  ): Promise<string> {
    if (!this.sdk) {
      throw new InternalServerErrorException(
        'PinataService is not configured (PINATA_JWT missing)',
      );
    }
    try {
      const blob = new Blob([new Uint8Array(buffer)], { type: mimeType });
      const file = new File([blob], filename, { type: mimeType });
      const result = await this.sdk.upload.public.file(file, {
        metadata: { name: filename },
      });
      if (!result?.cid) {
        throw new InternalServerErrorException(
          'Pinata file upload returned no CID',
        );
      }
      return `ipfs://${result.cid}`;
    } catch (err) {
      throw new InternalServerErrorException(
        `Pinata file upload failed: ${(err as Error).message}`,
      );
    }
  }
}
