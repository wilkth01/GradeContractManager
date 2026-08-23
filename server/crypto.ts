/**
 * Symmetric encryption for secrets stored in the database.
 *
 * Used for Canvas personal access tokens, which are full-access credentials for
 * the instructor's Canvas account: anyone reading the database should not come
 * away able to act as them.
 *
 * AES-256-GCM, so tampering is detected rather than silently decrypting to
 * garbage. The key comes from TOKEN_ENCRYPTION_KEY when set, otherwise it is
 * derived from SESSION_SECRET -- which means rotating SESSION_SECRET
 * invalidates stored tokens and instructors must paste theirs again. That is
 * the safe failure: a token that cannot be decrypted is simply unusable.
 */
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

let cachedKey: Buffer | null = null;

function encryptionKey(): Buffer {
  if (cachedKey) return cachedKey;

  const source = process.env.TOKEN_ENCRYPTION_KEY || process.env.SESSION_SECRET;
  if (!source) {
    throw new Error(
      "TOKEN_ENCRYPTION_KEY or SESSION_SECRET must be set to store Canvas tokens"
    );
  }

  // A fixed salt keeps the derived key stable across restarts; the secret, not
  // the salt, is what has to stay private.
  cachedKey = scryptSync(source, "contract-grade-tracker.token", 32);
  return cachedKey;
}

/** Encrypt a secret for storage. Returns iv:authTag:ciphertext, base64. */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([iv, authTag, encrypted]).toString("base64");
}

/**
 * Decrypt a stored secret. Returns null when the value cannot be read --
 * tampered with, or encrypted under a key that has since changed -- so callers
 * treat it as "no token" instead of crashing.
 */
export function decryptSecret(stored: string | null | undefined): string | null {
  if (!stored) return null;

  try {
    const raw = Buffer.from(stored, "base64");
    const iv = raw.subarray(0, IV_LENGTH);
    const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const ciphertext = raw.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

    const decipher = createDecipheriv(ALGORITHM, encryptionKey(), iv);
    decipher.setAuthTag(authTag);

    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
