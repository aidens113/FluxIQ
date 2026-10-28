// The one constructor every site-reset refusal goes through (t743, the
// actionable-answer contract; rerun round 4, job `run-mvgw1854-5d10955b` and
// photo `run-mvgw7320-de416190`).
//
// In round 4 two builders resent a refused call until the repeat guard ended
// their brief: the refusal named no failed condition, so every honest
// variation was refused for a reason the model could not see, and the act kept
// being listed as undoable here. A refusal now always carries:
//
// - `code`: the closed `candidate.*` code, as before;
// - `failed`: the one condition that failed, from a closed set (`./failed.ts`);
// - `canMeet`: whether any call can meet that condition, and where --
//   `this_page` (another call here can), `another_page` (a call elsewhere can,
//   not one on this control) or `no_call` (none can: do not make it again);
// - `condition`: that condition and its `canMeet`, in generic words
//   (`./condition-words.ts`), so a later rewrite of `instruction` by a
//   caller never loses them;
// - `instruction`: what to do, as each caller words it.
//
// Every other field (act, actsToUndo, settle, ...) passes through unchanged,
// save one closed check (t772 R2, `./agreeing.ts`): a refusal whose own act a
// call can still meet never lists that act under `actsUnsettleable`.
// A test over every site-reset source file (`../site-reset/tests/refusal-sites.test.ts`)
// fails when a `candidate.*` refusal is written anywhere but through this
// constructor.

import type { JsonObject } from "../../../../../core/index.ts";
import { automationStudioSiteResetAnswerAgreeing as agreeing } from "./agreeing.ts";
import { AUTOMATION_STUDIO_SITE_RESET_CAN_MEET, type AutomationStudioSiteResetCanMeet } from "./can-meet.ts";
import { automationStudioSiteResetConditionWords } from "./condition-words.ts";
import { AUTOMATION_STUDIO_SITE_RESET_FAILED, type AutomationStudioSiteResetFailed } from "./failed.ts";

/** What every refusal must say beside its code; any other field passes through. */
export type AutomationStudioSiteResetRefusalAnswer = { failed: AutomationStudioSiteResetFailed; canMeet: AutomationStudioSiteResetCanMeet; instruction: string };

const FAILED: ReadonlySet<string> = new Set(AUTOMATION_STUDIO_SITE_RESET_FAILED);
const CAN_MEET: ReadonlySet<string> = new Set(AUTOMATION_STUDIO_SITE_RESET_CAN_MEET);

/**
 * A site-reset refusal's evidence: `{ ok: false, code, failed, canMeet,
 * condition, ...answer }` (header). Throws on a code outside `candidate.`, a
 * condition or `canMeet` outside its closed set, or an empty instruction: a
 * refusal that cannot say what failed is a defect, never an answer.
 */
export function automationStudioSiteResetRefusal<C extends `candidate.${string}`, A extends AutomationStudioSiteResetRefusalAnswer & JsonObject>(code: C, answer: A): { ok: false; code: C; condition: string } & A {
  if (!code.startsWith("candidate.") || code.length <= "candidate.".length) throw new Error(`site-reset refusal: code ${JSON.stringify(code)} is not a candidate code`);
  if (!FAILED.has(answer.failed)) throw new Error(`site-reset refusal: failed ${JSON.stringify(answer.failed)} is not a known condition`);
  if (!CAN_MEET.has(answer.canMeet)) throw new Error(`site-reset refusal: canMeet ${JSON.stringify(answer.canMeet)} is not one of ${[...CAN_MEET].join(", ")}`);
  if (typeof answer.instruction !== "string" || answer.instruction.trim() === "") throw new Error("site-reset refusal: an instruction is required");
  const { failed, canMeet, ...rest } = agreeing(answer);
  return { ok: false, code, failed, canMeet, condition: automationStudioSiteResetConditionWords(failed, canMeet), ...rest } as { ok: false; code: C; condition: string } & A;
}
