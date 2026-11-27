import { connectDatabase } from "../connection";
import { decryptSecret, encryptSecret, maskSecret } from "../crypto";
import { ProviderSettingModel, type ProviderSettingDoc } from "../models";

/** Public view of a provider's settings — never contains the secret. */
export interface ProviderSettingView {
  provider: string;
  hasKey: boolean;
  keyHint: string | null;
  options: Record<string, unknown>;
  lastTest: { ok: boolean; message: string; at: string } | null;
}

function toView(doc: ProviderSettingDoc | null, provider: string): ProviderSettingView {
  let keyHint: string | null = null;
  if (doc?.encryptedKey) {
    try {
      keyHint = maskSecret(decryptSecret(doc.encryptedKey));
    } catch {
      keyHint = "unreadable — please enter it again";
    }
  }
  return {
    provider,
    hasKey: Boolean(doc?.encryptedKey),
    keyHint,
    options: doc?.options ?? {},
    lastTest: doc?.lastTest ? { ...doc.lastTest, at: doc.lastTest.at.toISOString() } : null,
  };
}

export async function listProviderSettings(): Promise<ProviderSettingView[]> {
  await connectDatabase();
  const docs = await ProviderSettingModel.find().lean<ProviderSettingDoc[]>();
  return docs.map((d) => toView(d, d.provider));
}

export async function getProviderSettingView(provider: string): Promise<ProviderSettingView> {
  await connectDatabase();
  return toView(await ProviderSettingModel.findOne({ provider }).lean<ProviderSettingDoc>(), provider);
}

/**
 * Server-only: the decrypted key and options for a provider. Environment
 * variables (e.g. ANTHROPIC_API_KEY) take precedence over saved keys.
 */
export async function getProviderCredentials(
  provider: string,
  envVar?: string,
): Promise<{ apiKey: string | null; options: Record<string, unknown> }> {
  await connectDatabase();
  const doc = await ProviderSettingModel.findOne({ provider }).lean<ProviderSettingDoc>();
  const fromEnv = envVar ? process.env[envVar]?.trim() : undefined;
  let apiKey: string | null = fromEnv || null;
  if (!apiKey && doc?.encryptedKey) {
    try {
      apiKey = decryptSecret(doc.encryptedKey);
    } catch {
      apiKey = null;
    }
  }
  return { apiKey, options: doc?.options ?? {} };
}

export async function saveProviderSetting(
  provider: string,
  update: { apiKey?: string | null; options?: Record<string, unknown>; resetTest?: boolean },
): Promise<ProviderSettingView> {
  await connectDatabase();
  const $set: Record<string, unknown> = {};
  if (update.apiKey !== undefined) $set.encryptedKey = update.apiKey ? encryptSecret(update.apiKey.trim()) : null;
  if (update.options) for (const [k, v] of Object.entries(update.options)) $set[`options.${k}`] = v;
  if (update.apiKey !== undefined || update.resetTest) $set.lastTest = null;
  const doc = await ProviderSettingModel.findOneAndUpdate({ provider }, { $set, $setOnInsert: { provider } }, { returnDocument: "after", upsert: true }).lean<ProviderSettingDoc>();
  return toView(doc, provider);
}

export async function recordProviderTest(provider: string, ok: boolean, message: string): Promise<void> {
  await connectDatabase();
  await ProviderSettingModel.updateOne(
    { provider },
    { $set: { lastTest: { ok, message, at: new Date() } }, $setOnInsert: { provider } },
    { upsert: true },
  );
}
