// What a loop's model and the person watching are told.
//
// Plain and generic: what was repeated, how many times, what did not change.
// Core's words and Core's tool ids, never a page's, a row's or the task's. The
// same sentences go to every kind of site and every role.

import type { JsonObject } from "../../../../core/index.ts";
import type { AutomationStudioLlmLoopFinding, AutomationStudioLlmLoopPattern, AutomationStudioLlmLoopSignal, AutomationStudioLlmLoopUnchanged } from "./types.ts";

/** The entry a steer is shown under; a newer one replaces the older. */
export const AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_CHECK_TOOL_ID = "core.loop_check";

/** The code a steer is recorded under, with its pattern as the row's reason. */
export const AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_STEERED_CODE = "llm_evidence_loop.loop_steered";

/** The codes a signal is recorded under, with its pattern as the row's reason. */
export const AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_SIGNAL_CODES: Readonly<Record<AutomationStudioLlmLoopSignal["kind"], string>> = Object.freeze({
  change_approach: "llm_evidence_loop.loop_change_approach",
  ask_person: "llm_evidence_loop.loop_ask_person"
});

const UNCHANGED_WORDS: Readonly<Record<AutomationStudioLlmLoopUnchanged, string>> = Object.freeze({
  page: "no new page",
  rows: "no new rows",
  acts: "no act that landed",
  draft: "no change to the draft"
});

/** What the model's own loop can do instead: a loop that drafts nothing has no draft to change. */
const DO_INSTEAD = {
  drafted: "Do something different: look at or search the page for what you need, use a different control or a different input, go to another page, amend the draft, or ask the person.",
  undrafted: "Do something different: look at or search the page for what you need, use a different control or a different input, go to another page, or ask the person."
} as const;

/** Which loop is being told: whether it holds a draft it can amend. */
export type AutomationStudioLlmLoopAudience = keyof typeof DO_INSTEAD;

/** What was repeated, how often and what did not change, in one sentence. */
function repeated(finding: AutomationStudioLlmLoopFinding): string {
  const unchanged = finding.unchanged.map((word) => UNCHANGED_WORDS[word]).join(", ");
  const calls = finding.toolIds.join(", ");
  if (finding.pattern === "near_repeat") return `You have made the same call to ${calls} on the same page ${finding.repeats} times, changing at most its wording, and it came to nothing: ${unchanged}.`;
  if (finding.pattern === "cycle") return `You have been going round the same calls (${calls}) ${finding.repeats} times in the same order, and the last round brought nothing new: ${unchanged}.`;
  if (finding.pattern === "no_progress") return `Your last ${finding.repeats} calls (${calls}) each ran and brought nothing new: ${unchanged}.`;
  if (finding.pattern === "same_fix") return `This fix has been tried ${finding.repeats} times already, and what it leads to has already stood and did not work.`;
  if (finding.pattern === "same_act") return `You have done this same lasting act on the same target ${finding.repeats} times (${calls}), with no new row between them. The page changing does not make it new work: each one did it again.`;
  return `You have made this exact call on this exact page ${finding.repeats} times, and it did not work or changed nothing.`;
}

/** The note a steer shows the model. The call that showed the loop has run; the next one like it will not, unless it is a lasting act on a loop that never refuses one (`nextRefused`). */
export function automationStudioLlmLoopSteerNote(finding: AutomationStudioLlmLoopFinding, audience: AutomationStudioLlmLoopAudience, nextRefused = true): JsonObject {
  return {
    ok: true,
    code: AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_STEERED_CODE,
    pattern: finding.pattern,
    repeats: finding.repeats,
    toolIds: [...finding.toolIds],
    unchanged: [...finding.unchanged],
    instruction: `${repeated(finding)} Doing the same again will do the same${nextRefused ? ", and the next one like it will be refused before it runs" : ""}. ${DO_INSTEAD[audience]}`
  };
}

/** What a call refused on a finding is told, in place of the exact repeat's words. */
export function automationStudioLlmLoopRefusalInstruction(finding: { pattern: AutomationStudioLlmLoopPattern; repeats?: number | undefined; toolIds?: readonly string[] | undefined }, audience: AutomationStudioLlmLoopAudience): string {
  return `${repeated({ pattern: finding.pattern, repeats: finding.repeats ?? 2, toolIds: finding.toolIds ?? [], unchanged: ["page", "rows", "acts", "draft"] })} So this one was not run, and it cost nothing but this decision. ${DO_INSTEAD[audience]} Refusals in a row end this work where it stands.`;
}

/** The chat step for a steer: a person's words, with no code in them. */
export function automationStudioLlmLoopChatWords(finding: AutomationStudioLlmLoopFinding): { title: string; text: string } {
  const title = "Noticed it was repeating itself";
  if (finding.pattern === "near_repeat") return { title, text: `FluxIQ tried the same thing ${finding.repeats} times and nothing changed, so it is trying something else.` };
  if (finding.pattern === "cycle") return { title, text: "FluxIQ kept going back and forth between the same steps with nothing new to show for it, so it is trying something else." };
  if (finding.pattern === "no_progress") return { title, text: `The last ${finding.repeats} steps found nothing new, so FluxIQ is changing what it does next.` };
  if (finding.pattern === "same_fix") return { title, text: "That fix was already tried and did not work, so FluxIQ is looking for a different one." };
  if (finding.pattern === "same_act") return { title, text: `FluxIQ did the same thing ${finding.repeats} times on the same item, so it is checking the page before doing any more.` };
  return { title, text: `FluxIQ tried the same thing ${finding.repeats} times and it did not work, so it is trying something else.` };
}
