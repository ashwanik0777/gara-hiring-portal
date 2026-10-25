import { LocalStorageService } from "./local-storage-service";
import { StorageService } from "./types";

let storageInstance: StorageService | null = null;

export function getStorageService(): StorageService {
  if (!storageInstance) {
    storageInstance = new LocalStorageService();
  }
  return storageInstance;
}

export * from "./types";
export { LocalStorageService } from "./local-storage-service";
export type { LocalStorageServiceOptions } from "./local-storage-service";
export {
  ALLOWED_PRIVATE_UPLOAD_MIME_TYPES,
  MAX_PRIVATE_UPLOAD_BYTES,
  matchesFileSignature,
} from "./upload-policy";
export {
  ClamdVirusScanner,
  createVirusScannerFromEnv,
  INFECTED_UPLOAD_MESSAGE,
  SCAN_UNAVAILABLE_MESSAGE,
  VirusScanFailedError,
  VirusScanUnavailableError,
} from "./virus-scanner";
export type { VirusScanner, VirusScanResult } from "./virus-scanner";
