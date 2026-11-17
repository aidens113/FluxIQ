import { canonicalJson } from "../../fluxnode/json/index.ts";
import { appContractError, type AppParseResult } from "../error/index.ts";
import { appGrantCovers } from "../grants/index.ts";
import { parseAppManifest } from "../manifest/index.ts";
import { parseAppInstallation } from "./parse.ts";
import type { AppInstallationV1 } from "./schema.ts";

/** Structural correspondence only. Host provenance, identity, IAM and payment authority remain mandatory. */
export function validateAppInstallationAgainstManifest(installation: unknown, manifest: unknown): AppParseResult<AppInstallationV1> {
  const installed = parseAppInstallation(installation);
  if (!installed.ok) return installed;
  const parsed = parseAppManifest(manifest);
  if (!parsed.ok) return parsed;
  const { publisherId, appId, version, packageDigest, manifestDigest } = parsed.value;
  if (canonicalJson(installed.value.app) !== canonicalJson({ publisherId, appId, version, packageDigest, manifestDigest })) return { ok: false, error: appContractError("app.installation_pin_mismatch") };
  if (!parsed.value.requirements.environments.includes(installed.value.target.environment)) return { ok: false, error: appContractError("app.invalid_installation") };
  if (installed.value.approvedGrants.some(grant => !parsed.value.requestedGrants.some(request => appGrantCovers(request, grant)))) return { ok: false, error: appContractError("app.grant_expansion") };
  return installed;
}
