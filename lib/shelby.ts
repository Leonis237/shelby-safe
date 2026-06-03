import {
  ShelbyClient,
  ShelbyBlobClient,
  generateCommitments,
  createDefaultErasureCodingProvider,
  defaultErasureCodingConfig,
  type ErasureCodingProvider,
} from "@shelby-protocol/sdk/browser";
import { AccountAddress, Network } from "@aptos-labs/ts-sdk";
import type { InputGenerateTransactionPayloadData } from "@aptos-labs/ts-sdk";
import type { UploadError, ErrorCode } from "./types";

const SHELBYNET_RPC = "https://api.shelbynet.shelby.xyz/shelby";

let client: ShelbyClient | null = null;

export function getShelbyClient(apiKey?: string): ShelbyClient {
  if (!client) {
    client = new ShelbyClient({
      network: Network.SHELBYNET,
      apiKey,
      rpc: { baseUrl: SHELBYNET_RPC },
    });
  }
  return client;
}

export function resetShelbyClient(): void {
  client = null;
}

/**
 * Erasure-coding provider used to compute blob commitments.
 * Created once and reused — initialization loads a WASM backend.
 */
let providerPromise: Promise<ErasureCodingProvider> | null = null;
function getProvider(): Promise<ErasureCodingProvider> {
  if (!providerPromise) providerPromise = createDefaultErasureCodingProvider();
  return providerPromise;
}

/** Signs and submits an Aptos transaction through the connected wallet. */
export type SignAndSubmit = (
  payload: InputGenerateTransactionPayloadData
) => Promise<{ hash: string }>;

/** Classify raw errors into structured UploadError */
export function classifyError(e: unknown): UploadError {
  const msg = e instanceof Error ? e.message : String(e ?? "Unknown error");
  const lower = msg.toLowerCase();

  let code: ErrorCode = "UNKNOWN";
  let recoverable = true;

  if (lower.includes("rate") || lower.includes("too many") || lower.includes("429")) {
    code = "RATE_LIMITED";
    recoverable = true;
  } else if (lower.includes("insufficient") || lower.includes("not enough") || lower.includes("fund")) {
    code = "INSUFFICIENT_FUNDS";
    recoverable = false;
  } else if (lower.includes("network") || lower.includes("fetch") || lower.includes("timeout") || lower.includes("econnrefused")) {
    code = "NETWORK_ERROR";
    recoverable = true;
  } else if (lower.includes("invalid_auth") || lower.includes("unauthorized") || lower.includes("403")) {
    code = "INVALID_AUTH";
    recoverable = false;
  } else if (lower.includes("decrypt") || lower.includes("wrong wallet")) {
    code = "DECRYPT_FAILED";
    recoverable = false;
  }

  return { message: msg, code, recoverable };
}

export function errorToUserMessage(err: UploadError): string {
  switch (err.code) {
    case "RATE_LIMITED":
      return "Too many requests. Wait a moment and try again.";
    case "INSUFFICIENT_FUNDS":
      return "Not enough APT or ShelbyUSD. Fund your wallet on ShelbyNet first.";
    case "NETWORK_ERROR":
      return "Network error. Check your connection and retry.";
    case "INVALID_AUTH":
      return "Auth failed. Try reconnecting your wallet.";
    case "DECRYPT_FAILED":
      return "Decrypt failed. Wrong wallet or corrupted data.";
    default:
      return err.message;
  }
}

/**
 * Upload encrypted note data to Shelby.
 *
 * The Shelby SDK's `client.upload()` expects a local `Account` (private key in
 * hand) to sign the on-chain registration and the storage auth challenge — that
 * model is for server/CLI use and cannot work with a browser wallet, which never
 * exposes its private key. So we orchestrate the two steps the wallet way:
 *
 *   1. Register the blob on-chain. We build the `register_blob` payload and have
 *      the connected wallet sign + submit it (the wallet pays gas + ShelbyUSD).
 *   2. Upload the bytes via `rpc.putBlob` — the unauthenticated multipart path,
 *      which needs no signature because the on-chain registration (with the
 *      blob's merkle root) is what authorizes and validates the upload.
 */
export async function uploadEncryptedBlob(params: {
  data: Uint8Array;
  blobName: string;
  accountAddress: string;
  signAndSubmit: SignAndSubmit;
  ttlDays?: number;
}): Promise<void> {
  const c = getShelbyClient();
  const account = AccountAddress.fromString(params.accountAddress);
  const expirationMicros =
    Date.now() * 1000 + (params.ttlDays ?? 365) * 24 * 60 * 60 * 1_000_000;

  // Skip on-chain registration if the blob already exists (idempotent retry).
  const existing = await c.coordination.getBlobMetadata({
    account,
    name: params.blobName,
  });
  if (!existing) {
    const provider = await getProvider();
    const commitments = await generateCommitments(provider, params.data);
    const payload = ShelbyBlobClient.createRegisterBlobPayload({
      account,
      blobName: params.blobName,
      blobSize: params.data.length,
      blobMerkleRoot: commitments.blob_merkle_root,
      numChunksets: commitments.chunkset_commitments.length,
      expirationMicros,
      encoding: defaultErasureCodingConfig().enumIndex,
    });
    const { hash } = await params.signAndSubmit(payload);
    // waitForIndexer so the blob is queryable via getAccountBlobs right after.
    await c.aptos.waitForTransaction({
      transactionHash: hash,
      options: { waitForIndexer: true },
    });
  }

  await c.rpc.putBlob({
    account,
    blobName: params.blobName,
    blobData: params.data,
  });
}

/**
 * List all blobs for an account (with metadata).
 */
export async function listAccountBlobs(accountAddress: string) {
  const c = getShelbyClient();
  const blobs = await c.coordination.getAccountBlobs({
    account: AccountAddress.fromString(accountAddress),
  });
  // `b.name` is the full on-chain key (e.g. "@<addr>/shelbysafe-..."); the
  // suffix is what putBlob/getBlob and our "shelbysafe-" filter operate on.
  return blobs.map((b) => ({
    name: b.blobNameSuffix,
    size: Number(b.size),
    expirationMicros: Number(b.expirationMicros),
    /** Last 8 chars of blob name as short ID */
    shortId: b.blobNameSuffix.slice(-8),
  }));
}

/**
 * Download a blob by name, returns raw bytes.
 */
export async function downloadBlob(
  accountAddress: string,
  blobName: string
): Promise<Uint8Array> {
  const c = getShelbyClient();
  const blob = await c.download({
    account: AccountAddress.fromString(accountAddress),
    blobName,
  });
  const reader = blob.readable.getReader();
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const total = chunks.reduce((a, b) => a + b.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

export function parseBlobName(blobName: string): {
  timestamp: number;
  isShelbySafe: boolean;
} {
  const match = blobName.match(/^shelbysafe-(\d+)-/);
  if (match) {
    return { timestamp: parseInt(match[1], 10), isShelbySafe: true };
  }
  return { timestamp: 0, isShelbySafe: false };
}

export function generateBlobName(): string {
  const ts = Date.now();
  const rnd = Math.random().toString(36).slice(2, 6);
  return `shelbysafe-${ts}-${rnd}`;
}
