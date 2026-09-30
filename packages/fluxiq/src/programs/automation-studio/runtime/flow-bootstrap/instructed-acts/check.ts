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
// **Arriving is not doing.** A step that only went to where the Flow starts
// changed something -- the page -- so it passed as doing any act. Run 15
// (`run-munoeac4-33c17306`) was accepted with two navigations to its start
// location named for putting hubs in the cart and collecting a coupon; the Flow
// ran, did neither, and Core's own verification refuted it. Run 13
// (`run-munmmj5n-52d8a67d`) passed with seven navigations. Such a step now
// answers an act of opening and no other. Core reads it off the step's values
// against the start location the build was given (`../reachability/`), never
// off a node id, so no domain's navigation is named here; a build given no
// start location is held to nothing new.
//
// **Doing it once, or maybe, is not doing it.** Lane D's run 2
// (`run-munnop9n-5475d593`) was told to confirm everyone with five or more
// mutual friends, pressed one Confirm on the first card, marked it optional and
// named it for the act; it passed, and the Flow confirmed one request of four.
// Two things were wrong, and each is now refused on what the draft itself says,
// with no page read: a step marked `optional` answers no act, because the Flow
// carries on without it when it fails (`step_is_optional`); and an act asked
// for every member of a set (`plural`, `./instruction-acts.ts`) is answered only
// by a step the Flow repeats -- one carrying `repeat`, or one inside the span a
// kept step repeats (`act_needs_repeat`).
//
// **Only a draft is checked.** A plan the model wrote as a script has no steps
// to name, so it is left where it stood before this check existed.
import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../flow-draft/index.ts";
import { automationStudioFlowDraftStepById, automationStudioFlowDraftStepIsProposable, automationStudioFlowDraftStepIsProposed } from "../../flow-draft/index.ts";
import { automationStudioFlowBootstrapDraftStepGoesToLocation } from "../reachability/index.ts";
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
  + "missingActs.acts are things the person's instruction asks to be done -- each quote is their own words -- that no step in your Flow is named as doing, and reason says why. "
  + "For each one: if a step in your Flow already does it, say so with amend_draft add on that step and act set to the act's id; if none does, run the node that does it (press the control, set the option, open the page) with add and act on the call. "
  + "Then complete again. A step you added with act already counts for that act; acts in the result, e.g. [{\"action\": \"a1\", \"step\": \"7\"}], names a step by its number and an act by its id, and a claim that names no act answers none. "
  + "Each act needs a step of its own, and it must be one that changed something.";

/** Said only when a claim named a step that only arrived, so the plain refusal stays as it was. */
const ARRIVAL_INSTRUCTION = " A reason of step_only_arrives means the step named only goes to the page this Flow starts on: "
  + "arriving at the start page does not do the act. After arriving, press or set the control that does it (the add, collect, save or set control), keep that step, and name it for the act instead.";

/** Said only when a claim named an optional step. */
const OPTIONAL_INSTRUCTION = " A reason of step_is_optional means the step named is marked optional, so the Flow carries on without it when it fails and the act may never be done: "
  + "make it always run with amend_draft keep on that step, or name a step that always runs.";

/** Said only when an act over a whole set was claimed by a step that acts once; the way to repeat is the draft's own telling of it. */
const REPEAT_INSTRUCTION = " A reason of act_needs_repeat means the act is asked for every item of a list (plural) and the step named does it once: "
  + "run the step that lists the items (keeping only those to act on), act on one item, then amend_draft repeat over the listing step through the act's last step, and name the repeated step for the act.";

/** Every act, and whether the draft has a step for each. Nothing here calls a provider. */
export function checkAutomationStudioInstructedActs(input: {
  instructionText?: string | undefined;
  result: JsonObject;
  draftSteps?: readonly AutomationStudioFlowDraftStep[] | undefined;
  /**
   * Where the Flow starts, as the build was told it. A step that only went
   * there answers no act but one of opening. Absent, nothing is held to it.
   */
  startLocation?: string | undefined;
}): AutomationStudioInstructedActsVerdict {
  const acts = automationStudioInstructedActs(input.instructionText ?? "");
  if (!acts.length || !input.draftSteps) return { ok: true, acts };
  const steps = input.draftSteps;
  const startLocation = input.startLocation?.trim();
  const onlyArrives = (step: AutomationStudioFlowDraftStep): boolean =>
    startLocation ? automationStudioFlowBootstrapDraftStepGoesToLocation(step, startLocation) : false;
  // An authored step that says which act it does is the model's claim already
  // (`../../flow-draft/step.ts`, `acts`); a claim written in the result for the
  // same act id is not read twice.
  const fromDraft = automationStudioInstructedActDraftClaims(steps);
  const annotated = new Set(fromDraft.map((claim) => claim.action));
  const claims = [...fromDraft, ...readClaims(input.result.acts).filter((claim) => !annotated.has(claim.action.toLowerCase()))];
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
    const fault = step ? automationStudioInstructedActStepFault(act, step, steps, onlyArrives) : "no_such_step";
    if (fault) missing.push({ ...act, reason: fault, ...named });
    else if (used.has(step!)) missing.push({ ...act, reason: "step_claimed_twice", ...named });
    else used.add(step!);
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
      acts: missing.map((act) => ({ id: act.id, kind: act.kind, verb: act.verb, quote: act.quote, ...(act.plural ? { plural: true } : {}), reason: act.reason, ...(act.step ? { step: act.step } : {}) })),
      // The steps that could be named: kept, and changed something.
      stepsThatChangedSomething: kept.slice(0, MAX_LISTED_STEPS).map((step) => step.id ?? `${step.position}`),
      // Said rather than hidden, so a model does not take a cut list for all of them.
      ...(kept.length > MAX_LISTED_STEPS ? { stepsWithheld: kept.length - MAX_LISTED_STEPS } : {})
    },
    instruction: INSTRUCTION + REASON_INSTRUCTIONS
      .filter(([reason]) => missing.some((act) => act.reason === reason))
      .map(([, said]) => said)
      .join("")
  };
}

/**
 * Why this step does not do this act, or nothing when it does as far as the
 * draft can say: in the Flow, an action that changed something, not only the
 * arrival at the start (unless the act is one of opening), not optional, and
 * repeated when the act is over a whole set. The one rule the check and the
 * checklist shown beside the draft both apply (`./checklist.ts`).
 */
export function automationStudioInstructedActStepFault(
  act: AutomationStudioInstructedAct,
  step: AutomationStudioFlowDraftStep,
  steps: readonly AutomationStudioFlowDraftStep[],
  onlyArrives: (step: AutomationStudioFlowDraftStep) => boolean
): Exclude<AutomationStudioInstructedActMissing["reason"], "no_step_named" | "no_such_step" | "step_claimed_twice"> | undefined {
  if (step.disposition !== "kept") return "step_not_kept";
  if (step.effect !== "mutate" || !automationStudioFlowDraftStepIsProposable(step)) return "step_changed_nothing";
  if (act.kind !== "open" && onlyArrives(step)) return "step_only_arrives";
  if (step.routing?.kind === "optional") return "step_is_optional";
  if (act.plural && !repeated(step, steps)) return "act_needs_repeat";
  return undefined;
}

/**
 * The claims an authored draft already makes: each kept step that says which
 * acts it does, one claim per act, the step named by its position -- the name
 * the model reads in the draft.
 */
export function automationStudioInstructedActDraftClaims(steps: readonly AutomationStudioFlowDraftStep[]): AutomationStudioInstructedActClaim[] {
  return steps.flatMap((step) => step.disposition === "kept" ? (step.acts ?? []).map((act) => ({ action: act, step: `${step.position}` })) : []);
}

/** What a refusal adds for each reason that needs more than the plain instruction, in this order. */
const REASON_INSTRUCTIONS: ReadonlyArray<readonly [AutomationStudioInstructedActMissing["reason"], string]> = [
  ["step_only_arrives", ARRIVAL_INSTRUCTION],
  ["step_is_optional", OPTIONAL_INSTRUCTION],
  ["act_needs_repeat", REPEAT_INSTRUCTION]
];

/**
 * Whether the Flow runs this step once per item: it carries `repeat`, or it
 * lies between a kept step carrying `repeat` and the step that repeat runs
 * through. A repeat on a step the model withdrew is in no Flow, so it counts
 * for nothing.
 */
function repeated(step: AutomationStudioFlowDraftStep, steps: readonly AutomationStudioFlowDraftStep[]): boolean {
  if (step.routing?.kind === "repeat") return true;
  return steps.some((carrier) => {
    if (carrier.routing?.kind !== "repeat" || !automationStudioFlowDraftStepIsProposed(carrier)) return false;
    const through = automationStudioFlowDraftStepById(steps, carrier.routing.through)?.position ?? carrier.position;
    return step.position >= Math.min(carrier.position, through) && step.position <= Math.max(carrier.position, through);
  });
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
