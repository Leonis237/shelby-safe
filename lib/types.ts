export interface VaultNote {
  id: string;
  title: string;
  content: string;
  contentType: "note" | "file";
  fileName?: string;
  mimeType?: string;
  createdAt: number;
  version: 1;
}

export interface ShelbyBlobMeta {
  blobName: string;
  size: number;
  expirationMicros: number;
}

export type WalletStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";
