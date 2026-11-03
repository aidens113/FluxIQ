// The host keys a re-seal retires, and the seal and open every pass goes
// through (t747 design note b). Selection reads the key id from each sealed
// form's envelope (`sealedKeyId`), so a provider without it is refused: the job
// would otherwise have to re-seal blindly. Every fresh seal is checked too: one
// that still names a retiring key (the host has not made its new key current)
// is refused, and `check` probes for that before the job writes anything.
import type { AutomationStudioProjectContentProtection, AutomationStudioProtectedProjectContent } from "../content-protection.ts";

type KeyNamingProtection = AutomationStudioProjectContentProtection & { sealedKeyId(encryption: string): string };

const PROBE_MEDIA_TYPE = "application/octet-stream";

export class ContentResealRetiringKeys {
  readonly ids: readonly string[];

  private constructor(private readonly projectId: string, private readonly protection: KeyNamingProtection, ids: readonly string[]) {
    this.ids = Object.freeze([...ids]);
  }

  /**
   * Refuses a provider that cannot name a sealed form's key, an empty or
   * malformed key list, and a host whose current key is one being retired; the
   * last by sealing a probe, so it is refused before anything is written.
   */
  static async check(input: { projectId: string; protection: AutomationStudioProjectContentProtection; retiringKeyIds: readonly string[] }): Promise<ContentResealRetiringKeys> {
    const { protection } = input;
    if (typeof protection.sealedKeyId !== "function") {
      throw new Error(`Project content re-seal needs a protection that names the key of a sealed form (sealedKeyId); provider ${protection.providerId} does not.`);
    }
    const ids = [...new Set(input.retiringKeyIds)];
    if (ids.length === 0) throw new Error("Project content re-seal needs at least one retiring key id.");
    for (const id of ids) {
      if (typeof id !== "string" || !id.trim() || id.length > 100) throw new Error("Project content re-seal was given an invalid retiring key id.");
    }
    const keys = new ContentResealRetiringKeys(input.projectId, protection as KeyNamingProtection, ids);
    await keys.seal({ mediaType: PROBE_MEDIA_TYPE, content: Buffer.alloc(1) }, "a probe");
    return keys;
  }

  /** Whether a sealed form's envelope names a retiring key; throws when the envelope is not the provider's. */
  isRetiring(encryption: string): boolean {
    return this.ids.includes(this.protection.sealedKeyId(encryption));
  }

  /** Where a sealed form stands: under a retiring key, under another key, or `unreadable` when its envelope is not the provider's. */
  standing(encryption: string): "retiring" | "other" | "unreadable" {
    let keyId: string;
    try {
      keyId = this.protection.sealedKeyId(encryption);
    } catch {
      return "unreadable";
    }
    return this.ids.includes(keyId) ? "retiring" : "other";
  }

  /** Seals under the host's current key; throws, naming `what` and the key id, when that is still a retiring key. */
  async seal(input: { mediaType: string; content: Buffer }, what: string): Promise<AutomationStudioProtectedProjectContent> {
    const sealed = await this.protection.seal({ projectId: this.projectId, mediaType: input.mediaType, content: input.content });
    if (typeof sealed.encryption !== "string" || !sealed.encryption) throw new Error(`Project content re-seal of ${what} got no envelope from the protection.`);
    const keyId = this.protection.sealedKeyId(sealed.encryption);
    if (this.ids.includes(keyId)) {
      throw new Error(`Project content re-seal refused: ${what} still seals under retiring key ${keyId}; make the new host key current first.`);
    }
    return { content: Buffer.from(sealed.content), encryption: sealed.encryption };
  }

  open(input: { mediaType: string; content: Buffer; encryption: string }): Promise<Buffer> {
    return this.protection.open({ projectId: this.projectId, ...input });
  }
}
