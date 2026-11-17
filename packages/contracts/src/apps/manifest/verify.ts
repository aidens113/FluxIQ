import { appContractError, type AppParseResult } from "../error/index.ts";
import { appManifestDigest } from "./digest.ts";
import { parseAppManifest } from "./parse.ts";
import type { AppManifestV1 } from "./schema.ts";

/** Integrity only: a matching digest does not verify the claimed publisher or grant permissions. */
export async function verifyAppManifest(value: unknown): Promise<AppParseResult<AppManifestV1>> {
  const parsed = parseAppManifest(value);
  if (!parsed.ok) return parsed;
  try {
    return await appManifestDigest(parsed.value) === parsed.value.manifestDigest ? parsed : { ok: false, error: appContractError("app.manifest_digest_mismatch") };
  } catch {
    return { ok: false, error: appContractError("app.unavailable_crypto") };
  }
}
