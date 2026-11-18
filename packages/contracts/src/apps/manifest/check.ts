import type { RefinementCtx } from "zod";
import { appGrantCovers } from "../grants/index.ts";
import type { AppManifestContentV1 } from "./shape.ts";

export function checkAppManifest(manifest: AppManifestContentV1, context: RefinementCtx): void {
  if (manifest.operations.some(operation => operation.requestedGrants.some(request => !manifest.requestedGrants.some(grant => appGrantCovers(grant, request))))) context.addIssue({ code: "custom", message: "Operation capabilities must be declared by the manifest." });
  if (manifest.operations.some(operation => operation.kind === "execution") && !manifest.requirements.runtimes.length) context.addIssue({ code: "custom", message: "Execution declares a runtime requirement." });
}
