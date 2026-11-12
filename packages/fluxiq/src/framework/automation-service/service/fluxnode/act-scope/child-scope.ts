import { createHash } from "node:crypto";
import { canonicalJson } from "@fluxiq/contracts/fluxnode";
import type { PipelineCallInvocation } from "../../pipelines/index.ts";

/** The same logical child in a parent's continuation, distinct from every intentional equal-input occurrence. */
export function fluxNodeChildActScope(parentScope: string, invocation: PipelineCallInvocation, target: { name: string; specHash: string }): string {
  const identity = canonicalJson({ parentScope, invocation: { stepId: invocation.stepId, invocationId: invocation.invocationId }, target: { name: target.name } });
  return `fluxnode.child.${createHash("sha256").update(identity).digest("hex")}`;
}
