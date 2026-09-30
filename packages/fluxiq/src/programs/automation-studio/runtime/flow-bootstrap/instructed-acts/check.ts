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
// **Forgiving in how an act is named, never in whether it is.** The model may
// name an act by the id a refusal gave it (`a2`), by a word of the person's
// own that only that act's quote holds among acts of its kind ("napkins", where
// two acts add different things), by the verb, or by its kind; and a step by
// its id (`d7`) or its position (`7`). A claim that names no act answers none.
// They were once matched to acts in order, and `run-muncqlr0-3348202b` passed
// this check with a consent-dialog click and a store-chip click given as a
// store switch and an add to cart, because nothing held a claim to its act.
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
/** Steps listed as nameable. A Flow holds at most a hundred nodes per Subflow. */
const MAX_LISTED_STEPS = 100;
/** The shortest word that can tell one act's object from another's. */
const MIN_DISTINCTIVE_WORD = 4;

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
  + "Then complete again with acts listing every act by its id (a1, a2 ...) and its step, e.g. [{\"action\": \"a1\", \"step\": \"d7\"}]. A claim that names no act answers none. "
  + "Each act needs a step of its own, and it must be one that changed something.";

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
      stepsThatChangedSomething: kept.slice(0, MAX_LISTED_STEPS).map((step) => step.id ?? `${step.position}`),
      // Said rather than hidden, so a model does not take a cut list for all of them.
      ...(kept.length > MAX_LISTED_STEPS ? { stepsWithheld: kept.length - MAX_LISTED_STEPS } : {})
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

/**
 * Which claim answers which act. Only a claim that names an act answers it:
 * by id, then by a word only its quote holds among acts of its kind, then by
 * verb, then by kind. A claim that names none is left unassigned.
 */
function assign(acts: readonly AutomationStudioInstructedAct[], claims: readonly AutomationStudioInstructedActClaim[]): Map<string, AutomationStudioInstructedActClaim> {
  const assigned = new Map<string, AutomationStudioInstructedActClaim>();
  const free = [...claims];
  const take = (act: AutomationStudioInstructedAct, matches: (action: string) => boolean): void => {
    if (assigned.has(act.id)) return;
    const index = free.findIndex((claim) => matches(claim.action.toLowerCase()));
    if (index >= 0) assigned.set(act.id, free.splice(index, 1)[0]!);
  };
  for (const act of acts) take(act, (action) => action === act.id);
  for (const act of acts) {
    const own = distinctiveWords(act, acts);
    if (own.length) take(act, (action) => own.some((ownWord) => containsWord(action, ownWord)));
  }
  for (const act of acts) take(act, (action) => containsWord(action, act.verb));
  for (const act of acts) take(act, (action) => KIND_WORDS[act.kind].some((kindWord) => containsWord(action, kindWord)) || action === act.kind);
  return assigned;
}

/**
 * The words of an act's quote that no other act of its kind quotes, where
 * another shares its kind: "napkins" in "add the dinner napkins" beside "add
 * the paper towels". An act alone of its kind has none; its verb and kind name it.
 */
function distinctiveWords(act: AutomationStudioInstructedAct, acts: readonly AutomationStudioInstructedAct[]): string[] {
  const siblings = acts.filter((other) => other !== act && other.kind === act.kind);
  if (!siblings.length) return [];
  const theirs = new Set(siblings.flatMap((other) => wordsOf(other.quote)));
  return [...new Set(wordsOf(act.quote))].filter((ownWord) => !theirs.has(ownWord));
}

function wordsOf(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+/gu) ?? []).filter((found) => found.length >= MIN_DISTINCTIVE_WORD);
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
