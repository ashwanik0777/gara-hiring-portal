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
