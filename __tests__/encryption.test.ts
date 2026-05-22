import { describe, it, expect } from "vitest";
import { deriveKey, encrypt, decrypt, signForEncryption } from "../lib/encryption";

// Fake signature giống như wallet signMessage trả về
const FAKE_SIG = "0x" + "ab".repeat(64); // 128 hex chars = 64 bytes
const FAKE_MSG = "ShelbySafe-Vault-v1";

describe("encrypt/decrypt", () => {
  it("roundtrip: encrypt then decrypt returns original", async () => {
    const key = await deriveKey(FAKE_SIG);
    const plaintext = JSON.stringify({ title: "test note", content: "hello world 🔐", createdAt: Date.now() });

    const ciphertext = await encrypt(key, plaintext);
    expect(ciphertext).not.toBe(plaintext);
    expect(ciphertext.length).toBeGreaterThan(0);

    const decrypted = await decrypt(key, ciphertext);
    expect(decrypted).toBe(plaintext);
  });

  it("different signature → different key → cannot decrypt", async () => {
    const key1 = await deriveKey(FAKE_SIG);
    const key2 = await deriveKey("0x" + "cd".repeat(64));

    const ciphertext = await encrypt(key1, "secret data");
    await expect(decrypt(key2, ciphertext)).rejects.toThrow();
  });

  it("tampered ciphertext fails decrypt", async () => {
    const key = await deriveKey(FAKE_SIG);
    const ciphertext = await encrypt(key, "tamper test");

    // Flip a byte in the middle
    const bytes = new TextEncoder().encode(ciphertext);
    bytes[Math.floor(bytes.length / 2)] ^= 0xFF;
    const tampered = new TextDecoder().decode(bytes);

    await expect(decrypt(key, tampered)).rejects.toThrow();
  });

  it("empty content encrypts and decrypts", async () => {
    const key = await deriveKey(FAKE_SIG);
    const ct = await encrypt(key, "");
    const pt = await decrypt(key, ct);
    expect(pt).toBe("");
  });

  it("unicode content survives roundtrip", async () => {
    const key = await deriveKey(FAKE_SIG);
    const input = "🚀✨ seed phrase: abandon ability able about above absent absorb abstract absurd";
    const ct = await encrypt(key, input);
    const pt = await decrypt(key, ct);
    expect(pt).toBe(input);
  });

  it("large content roundtrip", async () => {
    const key = await deriveKey(FAKE_SIG);
    const input = "x".repeat(10000);
    const ct = await encrypt(key, input);
    const pt = await decrypt(key, ct);
    expect(pt).toBe(input);
  });
});
