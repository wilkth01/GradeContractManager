import { describe, it, expect, beforeAll } from "vitest";

beforeAll(() => {
  process.env.TOKEN_ENCRYPTION_KEY = "test-key-for-crypto-tests";
});

const { encryptSecret, decryptSecret } = await import("../crypto");

describe("secret storage", () => {
  it("round-trips a token", () => {
    const token = "10713~abcdefghijklmnopqrstuvwxyz0123456789";
    expect(decryptSecret(encryptSecret(token))).toBe(token);
  });

  it("does not store the plaintext", () => {
    const token = "10713~sensitivevalue";
    expect(encryptSecret(token)).not.toContain("sensitivevalue");
  });

  it("produces a different ciphertext each time", () => {
    // A fresh IV per encryption, so identical tokens are not identifiable.
    expect(encryptSecret("same")).not.toBe(encryptSecret("same"));
  });

  it("returns null for a tampered value rather than garbage", () => {
    const encrypted = encryptSecret("original");
    const raw = Buffer.from(encrypted, "base64");
    raw[raw.length - 1] ^= 0xff;
    expect(decryptSecret(raw.toString("base64"))).toBeNull();
  });

  it("returns null for missing or unreadable input", () => {
    expect(decryptSecret(null)).toBeNull();
    expect(decryptSecret("")).toBeNull();
    expect(decryptSecret("not-base64-at-all!!")).toBeNull();
  });
});
