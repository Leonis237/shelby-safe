export interface VaultNote {
  id: string;
  title: string;
  content: string;
  contentType: "note" | "file";
  fileName?: string;
  mimeType?: string;
  createdAt: number;
  version: 1;
  /** Metadata from Shelby blob */
  blobSize?: number;
  blobId?: string;
}

export interface ShelbyBlobMeta {
  blobName: string;
  size: number;
  expirationMicros: number;
}

export interface UploadError {
  message: string;
  code: ErrorCode;
  recoverable: boolean;
}

export type ErrorCode =
  | "RATE_LIMITED"
  | "INSUFFICIENT_FUNDS"
  | "NETWORK_ERROR"
  | "INVALID_AUTH"
  | "DECRYPT_FAILED"
  | "UNKNOWN";

export type WalletStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";
