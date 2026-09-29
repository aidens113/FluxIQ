// Whether every lasting act the instruction asks for has a step in the draft
// that does it (`./contracts.ts` says why, and which run it was measured on).
//
// **What is checked, and what cannot be.** Core cannot see what a step did to
// the page, so a claim is checked for what makes it possible: the step exists,
// the model kept it, it is an action that changed something, and no other act
// already claimed it. A model that names the wrong press for "save" passes this
// and is caught by the run's own verification; a model that names nothing,
// names a step it dropped, names a look, or names one press for two acts is
// caught here, while it can still act on it.
//
// **Forgiving in what it reads.** The model may name an act by the id a refusal
// gave it (`a2`), by the verb, by its kind, or not at all -- claims left over
// after the named ones are matched in order -- and a step by its id (`d7`) or
// its position (`7`). Only the step has to be right.
//
// **Only a draft is checked.** A plan the model wrote as a script has no steps
// to name, so it is left where it stood before this check existed.
import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../flow-draft/index.ts";
import { automationStudioFlowDraftStepIsProposable } from "../../flow-draft/index.ts";
import type {
  AutomationStudioInstructedAct,
  AutomationStudioInstructedActClaim,
  AutomationStudioInstructedActMissing,
  AutomationStudioInstructedActsVerdict
} from "./contracts.ts";
import { automationStudioInstructedActs } from "./instruction-acts.ts";

/** The issue a missing act refuses completion under. */
export const AUTOMATION_STUDIO_INSTRUCTED_ACT_MISSING_ISSUE_CODE = "bootstrap.instructed_act_missing";

const MAX_CLAIMS = 16;
const MAX_CLAIM_TEXT = 200;
const MAX_LISTED_STEPS = 32;

/** Words a claim may use to name each kind, beside its verb and id. */
const KIND_WORDS: Readonly<Record<AutomationStudioInstructedAct["kind"], readonly string[]>> = Object.freeze({
  save: ["save", "saved", "bookmark"],
  add_to: ["add", "added", "put", "cart", "basket", "watchlist", "wishlist"],
  claim: ["coupon", "voucher", "collect", "claim", "redeem"],
  set: ["switch", "set", "change", "filter", "sort", "narrow", "store", "radius", "location"],
  move: ["move", "moved"],
  open: ["open", "opened", "go", "view", "visit"],
  submit: ["book", "buy", "order", "send", "post", "create", "confirm", "withdraw", "submit", "place", "check out", "checkout", "ask", "request", "apply", "quote", "bid"]
});

const INSTRUCTION = "Nothing was created and this build is still open. "
  + "missingActs.acts are things the person's instruction asks to be done -- each quote is their own words -- that no kept step of your draft is named as doing, and reason says why. "
  + "For each one: if a kept step already does it, name that step's id in acts; if none does, run the node that does it (press the control, set the option, open the page), keep it, and name it. "
  + "Then complete again with acts listing every act and its step. Each act needs a step of its own, and it must be one that changed something.";

/** Every act, and whether the draft has a step for each. Nothing here calls a provider. */
export function checkAutomationStudioInstructedActs(input: {
  instructionText?: string | undefined;
  result: JsonObject;
  draftSteps?: readonly AutomationStudioFlowDraftStep[] | undefined;
}): AutomationStudioInstructedActsVerdict {
  const acts = automationStudioInstructedActs(input.instructionText ?? "");
  if (!acts.length || !input.draftSteps) return { ok: true, acts };
  const steps = input.draftSteps;
  const claims = readClaims(input.result.acts);
  const assigned = assign(acts, claims);
  const used = new Set<AutomationStudioFlowDraftStep>();
  const missing: AutomationStudioInstructedActMissing[] = [];
  for (const act of acts) {
    const claim = assigned.get(act.id);
    if (!claim) {
      missing.push({ ...act, reason: "no_step_named" });
      continue;
    }
    const step = findStep(steps, claim.step);
    const named = { step: claim.step.slice(0, 16) };
    if (!step) missing.push({ ...act, reason: "no_such_step", ...named });
    else if (step.disposition !== "kept") missing.push({ ...act, reason: "step_not_kept", ...named });
    else if (step.effect !== "mutate" || !automationStudioFlowDraftStepIsProposable(step)) missing.push({ ...act, reason: "step_changed_nothing", ...named });
    else if (used.has(step)) missing.push({ ...act, reason: "step_claimed_twice", ...named });
    else used.add(step);
  }
  if (!missing.length) return { ok: true, acts };
  const kept = steps.filter((step) => step.disposition === "kept" && step.effect === "mutate" && automationStudioFlowDraftStepIsProposable(step));
  return {
    ok: false,
    acts,
    missing,
    issue: {
      severity: "error",
      code: AUTOMATION_STUDIO_INSTRUCTED_ACT_MISSING_ISSUE_CODE,
      // Core's own sentence, quoting nothing; the person's words travel beside
      // the issues under `missingActs`.
      message: "The instruction asks for something to be done that no kept step of this draft is named as doing.",
      path: "acts"
    },
    missingActs: {
      acts: missing.map((act) => ({ id: act.id, kind: act.kind, verb: act.verb, quote: act.quote, reason: act.reason, ...(act.step ? { step: act.step } : {}) })),
      // The steps that could be named: kept, and changed something.
      stepsThatChangedSomething: kept.slice(0, MAX_LISTED_STEPS).map((step) => step.id ?? `${step.position}`)
    },
    instruction: INSTRUCTION
  };
}

/** The model's claims, in any of the shapes it may reasonably write them. */
function readClaims(value: unknown): AutomationStudioInstructedActClaim[] {
  const text = (item: unknown): string | undefined => typeof item === "string" && item.trim()
    ? item.trim().slice(0, MAX_CLAIM_TEXT)
    : typeof item === "number" && Number.isSafeInteger(item) ? `${item}` : undefined;
  const claims: AutomationStudioInstructedActClaim[] = [];
  if (Array.isArray(value)) {
    for (const item of value.slice(0, MAX_CLAIMS)) {
      if (!isRecord(item)) continue;
      const step = text(item.step ?? item.stepId ?? item.step_id ?? item.id);
      if (step) claims.push({ action: text(item.action ?? item.act ?? item.name) ?? "", step });
    }
  } else if (isRecord(value)) {
    // `{ "a1": "d7" }`, which is how a model that read a refusal's ids may write it.
    for (const [action, step] of Object.entries(value).slice(0, MAX_CLAIMS)) {
      const named = text(step);
      if (named) claims.push({ action: action.slice(0, MAX_CLAIM_TEXT), step: named });
    }
  }
  return claims;
}

/** Which claim answers which act: named ones first, the rest in order. */
function assign(acts: readonly AutomationStudioInstructedAct[], claims: readonly AutomationStudioInstructedActClaim[]): Map<string, AutomationStudioInstructedActClaim> {
  const assigned = new Map<string, AutomationStudioInstructedActClaim>();
  const free = [...claims];
  const take = (act: AutomationStudioInstructedAct, matches: (action: string) => boolean): void => {
    if (assigned.has(act.id)) return;
    const index = free.findIndex((claim) => matches(claim.action.toLowerCase()));
    if (index >= 0) assigned.set(act.id, free.splice(index, 1)[0]!);
  };
  for (const act of acts) take(act, (action) => action === act.id);
  for (const act of acts) take(act, (action) => containsWord(action, act.verb));
  for (const act of acts) take(act, (action) => KIND_WORDS[act.kind].some((kindWord) => containsWord(action, kindWord)) || action === act.kind);
  for (const act of acts) take(act, () => true);
  return assigned;
}

/** A step by its id (`d7`), or by its position (`7`, `step 7`, `#7`). */
function findStep(steps: readonly AutomationStudioFlowDraftStep[], named: string): AutomationStudioFlowDraftStep | undefined {
  const trimmed = named.trim().toLowerCase();
  const byId = steps.find((step) => step.id !== undefined && step.id.toLowerCase() === trimmed);
  if (byId) return byId;
  const position = /^(?:step\s*|#)?([0-9]{1,4})$/u.exec(trimmed)?.[1];
  return position === undefined ? undefined : steps.find((step) => step.position === Number(position));
}

function containsWord(text: string, word: string): boolean {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&").replace(/\s+/gu, "\\s+");
  return new RegExp(`(?<![a-z])${escaped}(?![a-z])`, "u").test(text);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
