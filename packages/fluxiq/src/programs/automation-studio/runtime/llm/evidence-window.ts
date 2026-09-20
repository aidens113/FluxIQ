// Which evidence the model is shown for one decision (`./evidence-loop.ts`
// asks for it before every decision). A batch comes back as one entry
// (`./evidence-batch/packet.ts`), sized to fit this window as a lone result is.

import type { JsonValue } from "../../../../core/index.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS } from "../loop-limits/index.ts";

/**
 * The evidence the model is shown for one decision: as much as the byte budget
 * carries, newest first, always in the order it happened.
 *
 * The newest result of each tool is taken first, and only then is what is left
 * filled in. The decision instruction tells the model that evidence entries are
 * "the current authoritative results of prior tool calls", and a window that
 * drops one of those while keeping an older, superseded entry contradicts it.
 *
 * Taking them newest-first was not enough, because an observation is made
 * early and answered against late. A live Flow Bootstrap observed the page it
 * had to author against on the first tool call, spent two more calls on smaller
 * things, and by the third decision -- the one that writes the Flow -- the page
 * was the oldest entry and the first one dropped, while a 76-byte refusal it
 * had already acted on stayed. So the model wrote the plan with the evidence
 * gone: every step of `run-mu6efrsv-f5b52d6a`'s Flow named `target.1`,
 * `target.2`, `target.3`, which are the page's first three elements and none of
 * them the control that step needed, and the build was refused
 * `web.handle.wrong_control`. The handles it needed had been in front of it two
 * calls earlier.
 *
 * An entry that does not fit is skipped rather than ending the walk: a single
 * large old entry no longer hides every smaller one behind it.
 */
export function automationStudioLlmEvidenceContextWindow(
  evidence: Array<{ callId: string; toolId: string; value: JsonValue }>,
  maxBytes: number
): Array<{ callId: string; toolId: string; value: JsonValue }> {
  // The newest entry of each tool, by index. Walked newest first, so the first
  // sighting of a toolId is its current result.
  const current = new Set<number>();
  const seen = new Set<string>();
  for (let index = evidence.length - 1; index >= 0; index -= 1) {
    const { toolId } = evidence[index]!;
    if (seen.has(toolId)) continue;
    seen.add(toolId);
    current.add(index);
  }
  // `JSON.stringify` of the array is "[", the entries joined by ",", then "]",
  // which is what these bytes count. Measured per entry rather than by
  // re-serializing the whole window, so the two cannot disagree on a separator.
  const chosen = new Set<number>();
  let usedBytes = 2;
  const take = (index: number): void => {
    // Held to the provider's own count as well as the bytes: completion feedback
    // adds entries that are not tool calls, and a request carrying more than a
    // provider accepts is refused before it is sent.
    if (chosen.size >= AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS.maxToolCalls) return;
    const addedBytes = Buffer.byteLength(JSON.stringify(evidence[index]!), "utf8") + (chosen.size ? 1 : 0);
    if (usedBytes + addedBytes > maxBytes) return;
    chosen.add(index);
    usedBytes += addedBytes;
  };
  for (let index = evidence.length - 1; index >= 0; index -= 1) if (current.has(index)) take(index);
  for (let index = evidence.length - 1; index >= 0; index -= 1) if (!current.has(index)) take(index);
  return [...chosen].sort((left, right) => left - right).map((index) => evidence[index]!);
}

