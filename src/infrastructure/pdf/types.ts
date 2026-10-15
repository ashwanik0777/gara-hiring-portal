export interface CertificatePdfPayload {
  recipientName: string;
  programmeTitle: string;
  completionDate: string;
  issueDate: string;
  verificationCode: string;
  verificationUrl: string;
  signatoryName: string;
  signatoryTitle: string;
}

export interface PdfGeneratorService {
  generateCertificatePdf(payload: CertificatePdfPayload): Promise<Buffer>;
}
