import { PdfGeneratorService, CertificatePdfPayload } from "./types";
import { VectorPdfBuilder } from "./vector-pdf-builder";

export class CertificatePdfGenerator implements PdfGeneratorService {
  public async generateCertificatePdf(payload: CertificatePdfPayload): Promise<Buffer> {
    return VectorPdfBuilder.buildCertificate(payload);
  }
}

export const certificatePdfGenerator = new CertificatePdfGenerator();
