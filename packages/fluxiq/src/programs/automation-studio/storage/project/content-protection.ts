import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export const AUTOMATION_STUDIO_AES_GCM_PROJECT_CONTENT_PROTECTION_ID = "automation-studio.aes-256-gcm.v1" as const;

export type AutomationStudioProjectContentProtectionKey = { keyId: string; key: Uint8Array };
export type AutomationStudioProjectContentProtectionKeyResolver = (input: { projectId: string; keyId?: string }) => AutomationStudioProjectContentProtectionKey | undefined | Promise<AutomationStudioProjectContentProtectionKey | undefined>;
export type AutomationStudioProtectedProjectContent = { content: Buffer; encryption: string };

/**
 * Generic project-content protection boundary. Implementations must authenticate project and media-type context.
 *
 * Retiring a host key (t747). Everything a project seals (content-store
 * objects, gateway trace chunks and manifests, the wrapped content-address
 * keys) stays under the key it was sealed with until it is re-sealed, so a
 * host retires a key in this order:
 *  1. make the new key current, while the old key id still resolves;
 *  2. run `resealAutomationStudioProjectContent` with the old id in
 *     `retiringKeyIds` for every project until it reports `complete`; it is
 *     safe to interrupt, and a rerun picks up exactly what is still under the
 *     old key;
 *  3. only then stop resolving the old key id.
 * Content still sealed under a key the host stops resolving is lost.
 */
export interface AutomationStudioProjectContentProtection {
  readonly providerId: string;
  seal(input: { projectId: string; mediaType: string; content: Buffer }): Promise<AutomationStudioProtectedProjectContent>;
  open(input: { projectId: string; mediaType: string; content: Buffer; encryption: string }): Promise<Buffer>;
  /**
   * The id of the host key `encryption` (a sealed form's envelope) names;
   * throws when the envelope is not this provider's. The re-seal job selects
   * by it and refuses a provider without it.
   */
  sealedKeyId?(encryption: string): string;
}

type AesGcmEnvelope = { version: 1; providerId: typeof AUTOMATION_STUDIO_AES_GCM_PROJECT_CONTENT_PROTECTION_ID; keyId: string; iv: string; tag: string };

/** AES-256-GCM adapter whose host-owned resolver controls key creation, persistence, rotation, and retirement. */
export class AutomationStudioAesGcmProjectContentProtection implements AutomationStudioProjectContentProtection {
  readonly providerId = AUTOMATION_STUDIO_AES_GCM_PROJECT_CONTENT_PROTECTION_ID;
  constructor(private readonly resolveKey: AutomationStudioProjectContentProtectionKeyResolver) {}

  async seal(input: { projectId: string; mediaType: string; content: Buffer }): Promise<AutomationStudioProtectedProjectContent> {
    const resolved = await this.resolveKey({ projectId: projectId(input.projectId) });
    if (!resolved) throw new Error("Protected project content key is unavailable.");
    const keyId = safeKeyId(resolved.keyId);
    const key = keyBytes(resolved.key);
    const iv = randomBytes(12);
    try {
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      cipher.setAAD(aad(input.projectId, input.mediaType, keyId));
      const content = Buffer.concat([cipher.update(input.content), cipher.final()]);
      const envelope: AesGcmEnvelope = { version: 1, providerId: this.providerId, keyId, iv: iv.toString("base64url"), tag: cipher.getAuthTag().toString("base64url") };
      return { content, encryption: JSON.stringify(envelope) };
    } finally {
      key.fill(0);
    }
  }

  async open(input: { projectId: string; mediaType: string; content: Buffer; encryption: string }): Promise<Buffer> {
    const envelope = parseEnvelope(input.encryption);
    const resolved = await this.resolveKey({ projectId: projectId(input.projectId), keyId: envelope.keyId });
    if (!resolved || safeKeyId(resolved.keyId) !== envelope.keyId) throw new Error("Protected project content key is unavailable.");
    const key = keyBytes(resolved.key);
    try {
      const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(envelope.iv, "base64url"));
      decipher.setAAD(aad(input.projectId, input.mediaType, envelope.keyId));
      decipher.setAuthTag(Buffer.from(envelope.tag, "base64url"));
      return Buffer.concat([decipher.update(input.content), decipher.final()]);
    } catch {
      throw new Error("Protected project content authentication failed.");
    } finally {
      key.fill(0);
    }
  }

  /** The host key id the authenticated envelope names (it is bound into the AAD, so a forged id fails `open`). */
  sealedKeyId(encryption: string): string {
    return parseEnvelope(encryption).keyId;
  }
}

function parseEnvelope(value: string): AesGcmEnvelope {
  let parsed: unknown;
  try { parsed = JSON.parse(value); } catch { throw new Error("Protected project content metadata is invalid."); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Protected project content metadata is invalid.");
  const candidate = parsed as Partial<AesGcmEnvelope>;
  if (Object.keys(candidate).some((key) => !["version", "providerId", "keyId", "iv", "tag"].includes(key))) throw new Error("Protected project content metadata is invalid.");
  if (candidate.version !== 1 || candidate.providerId !== AUTOMATION_STUDIO_AES_GCM_PROJECT_CONTENT_PROTECTION_ID || typeof candidate.keyId !== "string" || typeof candidate.iv !== "string" || typeof candidate.tag !== "string") throw new Error("Protected project content metadata is invalid.");
  const envelope = { ...candidate, keyId: safeKeyId(candidate.keyId) } as AesGcmEnvelope;
  if (!/^[A-Za-z0-9_-]{16}$/u.test(envelope.iv) || !/^[A-Za-z0-9_-]{22}$/u.test(envelope.tag)) throw new Error("Protected project content metadata is invalid.");
  if (Buffer.from(envelope.iv, "base64url").byteLength !== 12 || Buffer.from(envelope.tag, "base64url").byteLength !== 16) throw new Error("Protected project content metadata is invalid.");
  return envelope;
}

function keyBytes(value: Uint8Array): Buffer {
  if (value.byteLength !== 32) throw new Error("Protected project content requires an exact 256-bit key.");
  return Buffer.from(value);
}
function safeKeyId(value: string): string { const result = value.trim(); if (!result || result.length > 100 || !/^[A-Za-z0-9._:-]+$/u.test(result)) throw new Error("Protected project content key ID is invalid."); return result; }
function projectId(value: string): string { const result = value.trim(); if (!result || result.length > 200 || !/^[A-Za-z0-9._-]+$/u.test(result)) throw new Error("Protected project content project ID is invalid."); return result; }
function mediaType(value: string): string { const result = value.trim().toLowerCase(); if (!/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/u.test(result)) throw new Error("Protected project content media type is invalid."); return result; }
function aad(project: string, media: string, keyId: string): Buffer { return Buffer.from(JSON.stringify({ providerId: AUTOMATION_STUDIO_AES_GCM_PROJECT_CONTENT_PROTECTION_ID, projectId: projectId(project), mediaType: mediaType(media), keyId }), "utf8"); }
