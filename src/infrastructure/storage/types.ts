export interface StorageUploadResult {
  storageKey: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}

export interface StorageGetResult {
  buffer: Buffer;
  mimeType: string;
  filename: string;
}

export interface StorageService {
  /**
   * Securely saves a private document.
   */
  upload(
    fileBuffer: Buffer | Uint8Array,
    filename: string,
    mimeType: string,
    prefix?: string
  ): Promise<StorageUploadResult>;

  /**
   * Retrieves a private document by its unique storage key.
   */
  get(storageKey: string): Promise<StorageGetResult | null>;

  /**
   * Removes a file by its unique storage key.
   */
  delete(storageKey: string): Promise<void>;

  /**
   * Generates a time-limited or authenticated access URL/token.
   */
  getDownloadUrl(storageKey: string, expiresInSeconds?: number): Promise<string>;
}
