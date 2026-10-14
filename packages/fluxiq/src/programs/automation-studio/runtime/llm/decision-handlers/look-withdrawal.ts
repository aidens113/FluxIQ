// What an ignored redirect costs the model: looking, until it acts.
//
// **Why this exists.** `run-munneauy-de8663ed` (t193, 2026-09-30) was told at
// iteration 9 that it already held the look it kept asking for, and asked for
// it again eight more times -- nine answers from memory in all, the redirect
// in front of it from the ninth on -- until the no-progress guard ended the
// build with no Flow. A redirect the model may ignore at no cost is advice; the
// only thing that turns it into a change of course is taking away the move it
// keeps making.
//
// **The rule.** When a no-progress redirect was put in front of the model and
// its very next decision is again answered from memory, or is a look Core ran
// again and found the page exactly as before, the redirect was ignored. From
// the decision after that until an action runs (`attemptEpoch` moves), looks
// are withdrawn:
//
//   - a tool that only observes is not offered at all;
//   - a tool that runs whichever of many actions a call names (`core.run_node`,
//     which says so with `actionInputKey`) is offered with that input narrowed
//     to exclude the actions this build saw report `effect: "observe"` and
//     `proposes: false` -- the snapshot, not the list read that becomes a step.
//
// The tools that finish a candidate (`core.submit_candidate`,
// `core.test_candidate`) are never withdrawn, though submitting is declared
// `observe` for the repeat guard: they are how a build stops looking. Lane C
// `run-mv0pa79q-ef91811b` (steps 0019, 0021) could not submit its Flow while
// looks were withdrawn, and each change of the offered list empties the
// provider's prompt cache.
//
// **The backstop.** A withdrawn look asked for anyway is refused as an unusable
// decision, `llm_evidence_loop.look_withdrawn`: never run, and never answered
// from memory, because an answer from memory is exactly the move being taken
// away. A node never seen to be a look is not withheld: whether a call looks
// is known only once it has run, and guessing would withhold actions.
//
// **A planning loop's look budget (t569).** A loop whose model plans rather
// than acts (`planning`, `../evidence-progress/planning-tools.ts`) has no action
// to run that would give looks back, so the redirect rule above is the wrong
// lever for it: the first live `project` build (`run-mv7t07hx-fe96a174`) made
// seven finds on an unchanged start page, each with a new query, so none was a
// repeat and no redirect was ever ignored. Its looks are counted instead --
// every observe-only call that ran and looked at something -- and once
// `lookBudget` of them have run, looks are withdrawn for the rest of the loop,
// the same way: not offered, and refused if asked for, under
// `llm_evidence_loop.look_budget_spent` so the refusal says why. The loop's own
// planning tools are never a look and never counted, whatever their effect,
// and the moment the budget is spent the model is told so and shown its way
// forward (`automationStudioLlmEvidenceLookBudget`, below).
//
// Only a loop that can refuse a decision without ending (`unusableDecisions`)
// withdraws anything; one that cannot has no way to say "not that" short of
// stopping. `actionInputKey` is the loop's own data and never leaves it: every
// offered tool is stripped of it, because provider adapters refuse a tool that
// carries a key they do not know (`../deepseek/preflight.ts`).

import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioLlmEvidenceEntry } from "../context-window.ts";
import type { AutomationStudioLlmDecisionContextRecorder } from "../decision-context/index.ts";
import type { AutomationStudioLlmEvidenceTool } from "../evidence-loop/index.ts";
import type { AutomationStudioLlmEvidencePlanningTools } from "../evidence-progress/index.ts";
import { automationStudioLlmEvidenceFinishingToolIds, type AutomationStudioLlmEvidenceFinishingTools } from "../loop-budget.ts";

/** The issue code a withdrawn look asked for anyway is refused under. */
export const AUTOMATION_STUDIO_LLM_EVIDENCE_LOOK_WITHDRAWN_CODE = "llm_evidence_loop.look_withdrawn";

/** The code the decision history lists a withdrawal under, beside the redirects. */
export const AUTOMATION_STUDIO_LLM_EVIDENCE_LOOKS_WITHDRAWN_CODE = "llm_evidence_loop.looks_withdrawn";

/** The issue code a look asked for after a planning loop's look budget is spent is refused under, and the code of the note that says it is. */
export const AUTOMATION_STUDIO_LLM_EVIDENCE_LOOK_BUDGET_SPENT_CODE = "llm_evidence_loop.look_budget_spent";

/** The evidence entry the spent look budget is said under. */
export const AUTOMATION_STUDIO_LLM_EVIDENCE_LOOK_BUDGET_TOOL_ID = "core.look_budget";

const LOOK_BUDGET_SPENT = "You have made every look this loop allows, so looking is withdrawn for the rest of it: no look is offered, and one asked for is refused. What you have seen is what you go on from.";

/**
 * A decision that asked again for what the loop holds: withdraws looks when it
 * ignored the redirect before it, and puts the withdrawal on the decision
 * history, where the model reads it beside the redirects. Called before this
 * iteration's own redirect, which would otherwise be the one it is judged by.
 */
export function automationStudioLlmEvidenceAskedAgain(
  context: { looks: AutomationStudioLlmEvidenceLookWithdrawal; history: AutomationStudioLlmDecisionContextRecorder; counters: { attemptEpoch: number } },
  iteration: number
): void {
  if (context.looks.askedAgain(iteration, context.counters.attemptEpoch)) {
    context.history.record(iteration, { kind: "redirect", code: AUTOMATION_STUDIO_LLM_EVIDENCE_LOOKS_WITHDRAWN_CODE });
  }
}

/**
 * One call that ran: counted against a planning loop's look budget when it was
 * a look that looked at something, and, the moment the budget is spent, the
 * note that says so, naming the loop's way forward, put in front of the model
 * and on the decision history beside the redirects.
 */
export function automationStudioLlmEvidenceLookBudget(
  context: {
    input: { planning?: AutomationStudioLlmEvidencePlanningTools | undefined };
    looks: AutomationStudioLlmEvidenceLookWithdrawal;
    history: AutomationStudioLlmDecisionContextRecorder;
    evidence: AutomationStudioLlmEvidenceEntry[];
    accountEvidence(value: JsonValue): number;
  },
  iteration: number,
  call: { tool: AutomationStudioLlmEvidenceTool; lookedAtNothing: boolean }
): void {
  const planning = context.input.planning;
  if (!planning || call.lookedAtNothing || !context.looks.looked(call.tool)) return;
  const next = planning.next();
  const note: JsonObject = {
    code: AUTOMATION_STUDIO_LLM_EVIDENCE_LOOK_BUDGET_SPENT_CODE,
    lookBudget: planning.lookBudget ?? 0,
    looksWithdrawn: true,
    ...(next.toolId ? { next: next.toolId } : {}),
    instruction: `${LOOK_BUDGET_SPENT} ${next.instruction}`
  };
  // Said once: the budget is spent once in a loop, so there is no earlier note of this kind to replace.
  context.accountEvidence(note);
  context.evidence.push({ callId: `${AUTOMATION_STUDIO_LLM_EVIDENCE_LOOK_BUDGET_TOOL_ID}.${iteration}`, toolId: AUTOMATION_STUDIO_LLM_EVIDENCE_LOOK_BUDGET_TOOL_ID, value: note });
  context.history.record(iteration, { kind: "redirect", code: AUTOMATION_STUDIO_LLM_EVIDENCE_LOOKS_WITHDRAWN_CODE });
}

export type AutomationStudioLlmEvidenceLookWithdrawal = {
  /** A no-progress redirect was put in front of the model after this iteration's decision. */
  redirectShown(iteration: number): void;
  /**
   * This iteration's decision asked again for what the loop holds: answered
   * from memory, or run again and found the same. True when that ignores the
   * redirect shown after the decision before it, which withdraws looks from the
   * next decision until an action runs.
   */
  askedAgain(iteration: number, attemptEpoch: number): boolean;
  /** Whether looks are withdrawn in this attempt epoch. */
  active(attemptEpoch: number): boolean;
  /**
   * A call of this tool ran and looked at something. True when it is the look
   * that spent a planning loop's look budget, which withdraws looks for the
   * rest of the loop; a planning tool or an action never counts.
   */
  looked(tool: AutomationStudioLlmEvidenceTool): boolean;
  /** The issue code a withdrawn look asked for anyway is refused under: why looks are withdrawn now. */
  refusalCode(attemptEpoch: number): string;
  /** A call of this tool ran the named action and reported it only looked and proposes no step. */
  sawLook(toolId: string, actionId: string): void;
  /** The tools to offer, with looks withdrawn when they are, and never carrying `actionInputKey`. */
  offer(tools: readonly AutomationStudioLlmEvidenceTool[], attemptEpoch: number): AutomationStudioLlmEvidenceTool[];
  /** Whether this request is a look withdrawn now. */
  refuses(tool: AutomationStudioLlmEvidenceTool, input: JsonObject, attemptEpoch: number): boolean;
};

export function automationStudioLlmEvidenceLookWithdrawal(input: {
  enabled: boolean;
  finishing?: AutomationStudioLlmEvidenceFinishingTools | undefined;
  planning?: Pick<AutomationStudioLlmEvidencePlanningTools, "toolIds" | "lookBudget"> | undefined;
}): AutomationStudioLlmEvidenceLookWithdrawal {
  // A loop's own finishing and planning tools are never a look, whatever their effect (t537, t569).
  const finishing = new Set([...automationStudioLlmEvidenceFinishingToolIds(input.finishing), ...(input.planning?.toolIds ?? [])]);
  const budget = input.planning?.lookBudget;
  let redirectAt: number | undefined;
  let withdrawnEpoch: number | undefined;
  let looksRun = 0;
  const spent = (): boolean => budget !== undefined && looksRun >= budget;
  const looks = new Map<string, Set<string>>();
  const active = (attemptEpoch: number): boolean => input.enabled && (withdrawnEpoch === attemptEpoch || spent());
  const observeOnly = (tool: AutomationStudioLlmEvidenceTool): boolean =>
    tool.effect !== "mutate" && tool.perCallEffect !== true && !finishing.has(tool.toolId);
  return {
    redirectShown(iteration) {
      redirectAt = iteration;
    },
    askedAgain(iteration, attemptEpoch) {
      if (!input.enabled || redirectAt === undefined || redirectAt !== iteration - 1 || active(attemptEpoch)) return false;
      withdrawnEpoch = attemptEpoch;
      return true;
    },
    active,
    looked(tool) {
      if (!input.enabled || budget === undefined || spent() || !observeOnly(tool)) return false;
      looksRun += 1;
      return spent();
    },
    refusalCode(attemptEpoch) {
      return input.enabled && spent() && withdrawnEpoch !== attemptEpoch ? AUTOMATION_STUDIO_LLM_EVIDENCE_LOOK_BUDGET_SPENT_CODE : AUTOMATION_STUDIO_LLM_EVIDENCE_LOOK_WITHDRAWN_CODE;
    },
    sawLook(toolId, actionId) {
      const seen = looks.get(toolId) ?? new Set<string>();
      seen.add(actionId);
      looks.set(toolId, seen);
    },
    offer(tools, attemptEpoch) {
      const withdrawn = active(attemptEpoch);
      return tools.flatMap((tool) => {
        const { actionInputKey, ...offered } = tool;
        if (!withdrawn) return [offered];
        if (observeOnly(tool)) return [];
        const seen = actionInputKey === undefined ? undefined : looks.get(tool.toolId);
        if (actionInputKey === undefined || !seen?.size) return [offered];
        const narrowed = narrow(offered.inputSchema, actionInputKey, seen);
        if (narrowed === "empty") return [];
        return [narrowed ? { ...offered, inputSchema: narrowed } : offered];
      });
    },
    refuses(tool, request, attemptEpoch) {
      if (!active(attemptEpoch)) return false;
      if (observeOnly(tool)) return true;
      const action = tool.actionInputKey === undefined ? undefined : request[tool.actionInputKey];
      return typeof action === "string" && looks.get(tool.toolId)?.has(action) === true;
    }
  };
}

/**
 * The input schema with `key`'s enumerated names less the withdrawn ones: a new
 * schema, `empty` when none is left, or nothing when the key enumerates no names
 * to narrow -- a library too large to enumerate is left as it is, and the
 * backstop refuses a withdrawn look named in it.
 */
function narrow(schema: JsonObject, key: string, withdrawn: ReadonlySet<string>): JsonObject | "empty" | undefined {
  const properties = schema.properties;
  if (!properties || typeof properties !== "object" || Array.isArray(properties)) return undefined;
  const property = (properties as JsonObject)[key];
  if (!property || typeof property !== "object" || Array.isArray(property) || !Array.isArray(property.enum)) return undefined;
  const names = property.enum.filter((name) => typeof name !== "string" || !withdrawn.has(name));
  if (!names.length) return "empty";
  if (names.length === property.enum.length) return undefined;
  return { ...schema, properties: { ...(properties as JsonObject), [key]: { ...property, enum: names } } };
}
