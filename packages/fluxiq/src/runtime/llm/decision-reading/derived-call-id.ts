// The id a tool call is given when it came without a usable one.
//
// `call.` and the FNV-1a hash of the tool and its input: the same call, the
// same id, so reading a reply twice (the provider adapter's check and the
// harness's) gives one id. The loop already makes ids unique
// (`../evidence-loop/call-id.ts`).

import type { JsonObject } from "../../../core/index.ts";

/** The id a tool call of `toolId` with `input` reads as, when it wrote none Core can use. */
export function automationStudioLlmDecisionDerivedCallId(toolId: string, input: JsonObject): string {
  let hash = 0x811c9dc5;
  for (const char of `${toolId}\u0000${JSON.stringify(input)}`) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `call.${hash.toString(16).padStart(8, "0")}`;
}
