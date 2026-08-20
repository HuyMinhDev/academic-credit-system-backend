import { Module } from '@nestjs/common';
import { CertificateController } from './certificate.controller';
import { CertificateService } from './certificate.service';
import { CertificatePdfService } from './certificate-pdf.service';

@Module({
  controllers: [CertificateController],
  providers: [CertificateService, CertificatePdfService],
  exports: [CertificateService],
})
export class CertificateModule {}
