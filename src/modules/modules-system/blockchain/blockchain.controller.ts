import { Controller, Get, HttpException, HttpStatus } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { BlockchainService } from './blockchain.service';
import { Public } from '../../../common/decorators/public.decorator';
import { responseSuccess } from '../../../common/helpers/response.helper';

@ApiTags('Blockchain')
@Controller('blockchain')
export class BlockchainController {
  constructor(private readonly blockchainService: BlockchainService) {}


  @Get('health')
  @Public()
  @ApiOperation({
    summary:
      'Verify blockchain connection (chainId, block number, contract addresses)',
  })
  @ApiResponse({ status: 200, description: 'Connection info returned' })
  async health() {
    try {
      const info = await this.blockchainService.verifyConnection();
      return responseSuccess(
        info,
        info.providerReachable
          ? 'Blockchain reachable'
          : 'Blockchain unreachable; check BLOCKCHAIN_RPC_URL',
      );
    } catch (err) {
      throw new HttpException(
        {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: `Failed to verify blockchain: ${(err as Error).message}`,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
