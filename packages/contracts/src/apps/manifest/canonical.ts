import { canonicalJson } from "../../fluxnode/json/index.ts";
import { canonicalJsonTypeSchema } from "../../fluxnode/type-schema/index.ts";
import type { JsonValue } from "../../core.ts";
import { appContractError } from "../error/index.ts";
import type { AppGrant } from "../grants/index.ts";
import { appManifestShape, type AppManifestContentV1 } from "./shape.ts";
import type { AppManifestV1 } from "./schema.ts";
import { checkAppManifest } from "./check.ts";

/** Canonical content excludes only manifestDigest. Package identity remains bound. */
export function canonicalAppManifest(manifest: AppManifestContentV1 | AppManifestV1): string {
  try {
    const { manifestDigest: _ownDigest, ...content } = manifest as AppManifestV1;
    const parsed = appManifestShape.superRefine(checkAppManifest).safeParse(content);
    if (!parsed.success) throw new Error();
    const value = parsed.data;
    const grants = (items: AppGrant[]) => items.map(item => item.capability === "automation.execute" ? { ...item, acts: [...item.acts].sort() } : item).sort((left, right) => compare(canonicalJson(left), canonicalJson(right)));
    const form = {
      ...value,
      frontend: { ...value.frontend, allowedOrigins: [...value.frontend.allowedOrigins].sort(), redirectUris: [...value.frontend.redirectUris].sort() },
      requestedGrants: grants(value.requestedGrants),
      operations: value.operations.map(operation => ({ ...operation, inputs: canonicalJsonTypeSchema(operation.inputs), result: canonicalJsonTypeSchema(operation.result), requestedGrants: grants(operation.requestedGrants) })).sort((left, right) => compare(left.id, right.id)),
      requirements: { runtimes: [...value.requirements.runtimes].sort(), environments: [...value.requirements.environments].sort(), callbacks: [...value.requirements.callbacks].sort((left, right) => compare(left.id, right.id)) }
    };
    return canonicalJson(form as unknown as JsonValue);
  } catch {
    throw new Error(appContractError("app.invalid_manifest").message);
  }
}

function compare(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
