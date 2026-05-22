import { ShelbyClient } from "@shelby-protocol/sdk/browser";
import {
  Account,
  AccountAddress,
  Ed25519PrivateKey,
  Network,
} from "@aptos-labs/ts-sdk";

const SHELBYNET_RPC = "https://api.shelbynet.shelby.xyz/shelby";

let client: ShelbyClient | null = null;

export function getShelbyClient(
  apiKey?: string,
  signChallengeHandler?: (account: Account, challenge: string) => Promise<{
    challenge: string;
    signature: Uint8Array;
    publicKey: Uint8Array;
    authScheme?: string;
  }>
): ShelbyClient {
  if (!client) {
    client = new ShelbyClient({
      network: Network.SHELBYNET,
      apiKey: apiKey,
      rpc: { baseUrl: SHELBYNET_RPC },
      signChallengeHandler: signChallengeHandler as any,
    });
  }
  return client;
}

export function resetShelbyClient(): void {
  client = null;
}

/**
 * Create a minimal Account object for the Shelby SDK.
 * The private key is unused — actual signing is handled by signChallengeHandler.
 */
export function createMinimalAccount(
  address: string,
  publicKeyHex: string
): Account {
  return Account.fromPrivateKeyAndAddress({
    privateKey: new Ed25519PrivateKey("0x" + "00".repeat(32)),
    address,
  });
}

/**
 * Upload encrypted note data to Shelby using wallet for signing.
 */
export async function uploadEncryptedBlob(params: {
  data: Uint8Array;
  blobName: string;
  account: Account;
  ttlDays?: number;
}): Promise<void> {
  const c = getShelbyClient();
  const expirationMicros =
    Date.now() * 1000 + (params.ttlDays ?? 365) * 24 * 60 * 60 * 1_000_000;

  await c.upload({
    blobData: params.data,
    signer: params.account,
    blobName: params.blobName,
    expirationMicros,
  });
}

/**
 * List all blobs for an account.
 */
export async function listAccountBlobs(accountAddress: string) {
  const c = getShelbyClient();
  const blobs = await c.coordination.getAccountBlobs({
    account: AccountAddress.fromString(accountAddress),
  });
  return blobs.map((b) => ({
    name: b.name,
    size: Number(b.size),
    expirationMicros: Number(b.expirationMicros),
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
