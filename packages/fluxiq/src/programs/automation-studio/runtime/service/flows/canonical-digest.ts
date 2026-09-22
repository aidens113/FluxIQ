import { createHash } from "node:crypto";
import type { AutomationStudioFlowArtifact } from "../../../model/index.ts";
import { stableJson } from "../stable-json.ts";

// A Flow's digest over everything but its updatedAt, so a save that changed
// nothing is recognised as unchanged.

export function canonicalFlowDigest(flow: AutomationStudioFlowArtifact): string {
  const { updatedAt: _updatedAt, ...stable } = flow;
  return createHash("sha256").update(stableJson(stable)).digest("hex");
}
