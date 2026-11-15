import { appContractError } from "../error/index.ts";
import type { AppManifestContentV1 } from "./shape.ts";
import type { AppManifestV1 } from "./schema.ts";
import { canonicalAppManifest } from "./canonical.ts";

export async function appManifestDigest(manifest: AppManifestContentV1 | AppManifestV1): Promise<string> {
  const content = canonicalAppManifest(manifest);
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error(appContractError("app.unavailable_crypto").message);
  try {
    const digest = await subtle.digest("SHA-256", new TextEncoder().encode(content));
    return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, "0")).join("");
  } catch {
    throw new Error(appContractError("app.unavailable_crypto").message);
  }
}
