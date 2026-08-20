import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { promises as fs } from 'fs';
import * as path from 'path';
import { PDFDocument, PDFFont, StandardFonts, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { formatVietnamTime } from '../../../common/helpers/datetime.helper';

export interface CertificatePdfInput {
  organization: {
    name: string;
    code?: string | null;
    address?: string | null;
  };
  student: {
    full_name: string;
    student_code?: string | null;
  };
  certificateCode: string;
  expires_at?: string | null;
  metadata: {
    program_name: string;
    major?: string | null;
    degree_type?: string | null;
    classification?: string | null;
    gpa?: number | null;
    graduation_year?: number | null;
    issue_decision_number?: string | null;
    issue_date?: string | null;
  };
}


@Injectable()
export class CertificatePdfService {
  private readonly logger = new Logger(CertificatePdfService.name);

  private readonly templatePath = path.join(
    process.cwd(),
    'assets',
    'certificates',
    'certificate.pdf',
  );
  private readonly fontRegularPath = path.join(
    process.cwd(),
    'assets',
    'fonts',
    'DejaVuSerif.ttf',
  );
  private readonly fontBoldPath = path.join(
    process.cwd(),
    'assets',
    'fonts',
    'DejaVuSerif-Bold.ttf',
  );

  async generateCertificate(input: CertificatePdfInput): Promise<Buffer> {
    let templateBytes: Buffer;
    try {
      templateBytes = await fs.readFile(this.templatePath);
    } catch (err) {
      this.logger.error(
        `Failed to read PDF template at ${this.templatePath}: ${(err as Error).message}`,
      );
      throw new InternalServerErrorException(
        'Certificate PDF template not found on server',
      );
    }

    let pdfDoc: PDFDocument;
    try {
      pdfDoc = await PDFDocument.load(templateBytes);
    } catch (err) {
      throw new InternalServerErrorException(
        `Failed to parse certificate PDF template: ${(err as Error).message}`,
      );
    }

    if (!(pdfDoc as unknown as { fontkit?: unknown }).fontkit) {
      pdfDoc.registerFontkit(fontkit);
    }

    let fontRegular: PDFFont;
    let fontBold: PDFFont;
    try {
      const [regularBytes, boldBytes] = await Promise.all([
        fs.readFile(this.fontRegularPath),
        fs.readFile(this.fontBoldPath),
      ]);
      fontRegular = await pdfDoc.embedFont(regularBytes, { subset: true });
      fontBold = await pdfDoc.embedFont(boldBytes, { subset: true });
    } catch (err) {
      this.logger.warn(
        `Failed to load DejaVu Serif fonts (${(err as Error).message}); falling back to Helvetica (WinAnsi only).`,
      );
      fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
      fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    }

    const page = pdfDoc.getPage(0);
    const { width, height } = page.getSize();

    const ink = rgb(0, 0, 0);

    const drawLeft = (text: string, x: number, y: number, size: number, f: PDFFont) => {
      page.drawText(text, { x, y, size, font: f, color: ink });
    };

    const drawCentered = (text: string, cx: number, y: number, size: number, f: PDFFont) => {
      const w = f.widthOfTextAtSize(text, size);
      page.drawText(text, { x: cx - w / 2, y, size, font: f, color: ink });
    };

    const cx = width / 2;


    // 1. Holder full name — sits directly below "This is to certify that".
    drawCentered(input.student.full_name, cx, 300, 28, fontBold);

    // 2. Student ID value — centred under the "Student ID:" label.
    if (input.student.student_code) {
      drawCentered(input.student.student_code, 245, 220, 14, fontRegular);
    }

    // 3. Major value — centred under the "Major:" label.
    if (input.metadata.major) {
      drawCentered(input.metadata.major, 630, 220, 14, fontRegular);
    }

    // 4. Grade value — centred under the "Grade:" label.
    if (input.metadata.classification) {
      drawCentered(input.metadata.classification, 250, 148, 14, fontRegular);
    }

    // 5. GPA value — centred under the "GPA:" label.
    if (input.metadata.gpa !== undefined && input.metadata.gpa !== null) {
      drawCentered(
        `${input.metadata.gpa.toFixed(2)} / 4.00`,
        640,
        148,
        14,
        fontRegular,
      );
    }

    // 6. Certificate ID value — sits inline to the right of the "ID:" label.
    drawLeft(input.certificateCode, 310, 63, 14, fontRegular);

    // 7. Issue date value — sits inline to the right of the "ngày cấp:" label.
    if (input.metadata.issue_date) {
      drawLeft(`| ${formatVietnamTime(input.metadata.issue_date)}`, 490, 63, 14, fontRegular);
    }

    // 8. Expires at value — sits inline to the right of the issue date value.
    if (input.expires_at) {
      drawLeft(`- ${formatVietnamTime(input.expires_at)}`, 585, 63, 14, fontRegular);
    }

    let out: Uint8Array;
    try {
      out = await pdfDoc.save();
    } catch (err) {
      throw new InternalServerErrorException(
        `Failed to serialize certificate PDF: ${(err as Error).message}`,
      );
    }
    return Buffer.from(out);
  }
}
