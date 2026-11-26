import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { repoRoot } from "@studio/media";

/**
 * Encryption for API keys saved from the Settings page (AES-256-GCM).
 * The key comes from SECRETS_KEY, or is generated once into
 * <repo>/.data/secret.key (git-ignored, mode 600).
 */

let cachedKey: Buffer | null = null;

function secretKey(): Buffer {
  if (cachedKey) return cachedKey;
  const fromEnv = process.env.SECRETS_KEY?.trim();
  if (fromEnv) return (cachedKey = createHash("sha256").update(fromEnv).digest());
  const dir = path.join(repoRoot(), ".data");
  const file = path.join(dir, "secret.key");
  if (!existsSync(file)) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, randomBytes(32).toString("hex"), { mode: 0o600 });
  }
  return (cachedKey = createHash("sha256").update(readFileSync(file, "utf8").trim()).digest());
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", secretKey(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), data.toString("base64")].join(":");
}

export function decryptSecret(sealed: string): string {
  const [version, iv, tag, data] = sealed.split(":");
  if (version !== "v1" || !iv || !tag || !data) throw new Error("Unrecognised secret format");
  const decipher = createDecipheriv("aes-256-gcm", secretKey(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
}

/** "sk-…abcd" — enough to recognise a key without revealing it. */
export function maskSecret(plain: string): string {
  return plain.length <= 8 ? "••••" : `${plain.slice(0, 3)}…${plain.slice(-4)}`;
}
