// Encryption utilities for ShelbySafe
// Uses AES-GCM via Web Crypto API with wallet-derived key

const SIGN_MESSAGE = "ShelbySafe-Vault-v1";

function hex2buf(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Derive an AES-GCM CryptoKey from a wallet signature.
 */
export async function deriveKey(signatureHex: string): Promise<CryptoKey> {
  const sigBytes = hex2buf(signatureHex);
  const hash = await crypto.subtle.digest("SHA-256", sigBytes.slice(0, 64));
  return crypto.subtle.importKey("raw", hash, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

/**
 * Sign the fixed message with wallet to get the encryption key seed.
 */
export async function signForEncryption(
  signMessage: (message: string) => Promise<string>
): Promise<string> {
  return signMessage(SIGN_MESSAGE);
}

export { SIGN_MESSAGE };

/**
 * Encrypt plaintext string with AES-GCM.
 * Returns base64(IV + ciphertext). IV is 12 bytes prepended.
 */
export async function encrypt(
  key: CryptoKey,
  plaintext: string
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoded
  );
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);
  // Convert to base64 safely
  let binary = "";
  for (let i = 0; i < combined.length; i++) {
    binary += String.fromCharCode(combined[i]);
  }
  return btoa(binary);
}

/**
 * Decrypt base64(IV + ciphertext) back to plaintext.
 */
export async function decrypt(
  key: CryptoKey,
  encryptedBase64: string
): Promise<string> {
  const binary = atob(encryptedBase64);
  const combined = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    combined[i] = binary.charCodeAt(i);
  }
  const iv = combined.slice(0, 12);
  const ciphertext = new Uint8Array(combined.buffer, 12);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext
  );
  return new TextDecoder().decode(plaintext);
}

/**
 * Helper to pass Uint8Array as BufferSource for Web Crypto API.
 */
function toBufferSource(data: Uint8Array): ArrayBuffer {
  return (data.buffer.slice(
    data.byteOffset,
    data.byteOffset + data.byteLength
  ) as ArrayBuffer);
}

/**
 * Encrypt binary data (for file uploads).
 */
export async function encryptBinary(
  key: CryptoKey,
  data: Uint8Array
): Promise<Uint8Array> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    toBufferSource(data)
  );
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return combined;
}

/**
 * Decrypt binary data.
 */
export async function decryptBinary(
  key: CryptoKey,
  encrypted: Uint8Array
): Promise<Uint8Array> {
  const iv = encrypted.slice(0, 12);
  const ciphertext = new Uint8Array(encrypted.buffer, 12, encrypted.length - 12);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    toBufferSource(ciphertext)
  );
  return new Uint8Array(plaintext);
}
