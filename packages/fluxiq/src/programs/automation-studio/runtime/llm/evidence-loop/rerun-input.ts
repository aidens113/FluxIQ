// What a `rerun` runs with: the step's own argument, changed only where the
// model said.
//
// **Why the model no longer writes the whole argument (t211).** A rerun used to
// carry "the whole argument to run the step's action with", and its schema was
// `{ type: "object" }` -- so to change one condition of a list read, the model
// rewrote the node, every column, every condition and the paging from memory,
// several levels deep, as free-form JSON. Those were the replies that came back
// unreadable. Lane C's re-author of `run-munw7ffn-fe1cecd2` sent 35 decisions:
// its reruns ran to 550-590 output tokens each, and 14 of its replies were
// `llm.provider_malformed_response`, every one of them between two such reruns
// and as slow as one (2.6-3.2 s against 1.3-2.0 s for a short decision). The
// same build's other adaptation, whose reruns stayed under 490 tokens, had
// none; the lane-A runs, whose decisions were 80-120-token tool calls, had one
// in 25 to 54. Truncation was ruled out: a reply cut at the output limit is
// reported as `llm.provider_output_truncated`, not malformed, no bundle holds
// one, and the 8,000-token reply reserve is the same before and after the
// input window grew to 1,000,000 tokens (t200).
//
// So a rerun's `input` is a JSON merge patch (RFC 7386) over the argument the
// step last ran with: only the keys that change, at the depth they sit. An
// object merges into the object there, any other value -- a list, a string, a
// number -- replaces what is there whole, and `null` removes the key. A model
// that still sends the whole argument gets exactly that argument for every key
// it wrote; what it left out is kept rather than dropped, which is the safe
// direction: a key it forgot to write is not a key it meant to remove.
import type { JsonObject, JsonValue } from "../../../../../core/index.ts";

/** The argument a rerun runs with: `patch` merged over `previous` (RFC 7386). */
export function automationStudioLlmEvidenceRerunInput(previous: JsonObject | undefined, patch: JsonObject): JsonObject {
  return mergePatch(structuredClone(previous ?? {}), patch);
}

function mergePatch(target: JsonObject, patch: JsonObject): JsonObject {
  const merged: JsonObject = { ...target };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) {
      delete merged[key];
      continue;
    }
    const current = merged[key];
    merged[key] = isObject(value) ? mergePatch(isObject(current) ? current : {}, value) : structuredClone(value);
  }
  return merged;
}

function isObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
