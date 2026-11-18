import { parseAppContract } from "../validation/index.ts";
import { appManifestSchema } from "./schema.ts";

/** Structural parse only; use verifyAppManifest for integrity, and host authority for trust. */
export function parseAppManifest(value: unknown) {
  return parseAppContract(appManifestSchema, value, "app.invalid_manifest", true);
}
