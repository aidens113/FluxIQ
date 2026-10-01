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
// Withdraw run 3 (`run-munnyvbr-11c28a0f`) repeated the row's Withdraw but not
// the confirmation it opens (`span_stops_short`, `./span.ts`), and declared the
// withdrawal a class nobody is asked about (`act_consequence_undeclared`,
// `./act-consequence.ts`). Both are now refused.
//
// **Choosing is not adding.** Live run 28 (`run-munvvc3z-3eadc185`) was told
// to add two packs of one product in one size and a pack of another in
// another size. It pressed add to cart once on each product page as the page
// loaded -- first size, quantity one -- named each press for its add, and
// passed. A quantity above one and a named variant of an added item are now
// requirements of their own (`requires`, `./instruction-choices.ts`), each held
// to what an act is held to, and to one thing more: the step claimed for the
// act -- or for anything else -- does not also answer a choice unless its own
// input sets it (`./choice-evidence.ts`), which a plain press of add does not
// (`choice_is_the_act_step`).
//
// **Only a draft is checked.** A plan the model wrote as a script has no steps
// to name, so it is left where it stood before this check existed.
import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../flow-draft/index.ts";
import { automationStudioFlowDraftStepIsProposable, automationStudioFlowDraftStepIsProposed } from "../../flow-draft/index.ts";
import { automationStudioFlowBootstrapDraftStepGoesToLocation } from "../reachability/index.ts";
import { automationStudioDraftStepDeclaresConsequence } from "./act-consequence.ts";
import { automationStudioInstructedChoiceSetBy } from "./choice-evidence.ts";
import type {
  AutomationStudioInstructedAct,
  AutomationStudioInstructedActClaim,
  AutomationStudioInstructedActMissing,
  AutomationStudioInstructedActsVerdict,
  AutomationStudioInstructedChoice
} from "./contracts.ts";
import { automationStudioInstructedActs } from "./instruction-acts.ts";
import { automationStudioInstructedActRepeatSpans, automationStudioInstructedActSpanStopsShort } from "./span.ts";

/** The issue a missing act refuses completion under. */
export const AUTOMATION_STUDIO_INSTRUCTED_ACT_MISSING_ISSUE_CODE = "bootstrap.instructed_act_missing";

/** The longest claim string read: an act id or a step reference, never the model's prose. */
const MAX_CLAIM_TEXT = 200;
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

/** Said only when a choice of an item is missing: how many, or which size, colour or version. */
const CHOICE_INSTRUCTION = " An id like a2.quantity or a2.size is a choice the person made for the item of that act (of): how many of it, or which size, colour, count or version -- quote is their words for it. "
  + "The press that adds does not make it: choose the size or set the quantity with its own step before adding -- press that option, or set the quantity control to the number -- keep that step, and name that step for the choice's id, e.g. {\"action\": \"a2.quantity\", \"step\": \"d9\"}. "
  + "A reason of choice_is_the_act_step means the step named is the one named for the act itself, and nothing it was given sets the choice.";

/** Said only when an act over a whole set was claimed by a step that acts once; the way to repeat is the draft's own telling of it. */
const REPEAT_INSTRUCTION = " A reason of act_needs_repeat means the act is asked for every item of a list (plural) and the step named does it once: "
  + "run the step that lists the items (keeping only those to act on), act on one item, then amend_draft repeat over the listing step through the act's last step, and name the repeated step for the act.";

/** Said only when a repeat ended one step before the press that finishes the act on each item. */
const SPAN_INSTRUCTION = " A reason of span_stops_short means the step right after your repeat (after) does part of the act on each item, such as the confirmation the repeated press opened, but runs once after the loop: repeat through it -- amend_draft repeat on the repeat's first step with through set to after.";

/** Said only when an act's verb names a class a person is asked about and no step of it declared that class. */
const CONSEQUENCE_INSTRUCTION = " A reason of act_consequence_undeclared means the person's words ask for an act of that class of consequence (consequence) and no step that does it declares it: rerun the step that does it declaring that class in its consequences, and keep it; the person will be asked before it happens.";

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
  const choices = acts.flatMap((act) => act.requires ?? []);
  const steps = input.draftSteps;
  const startLocation = input.startLocation?.trim();
  const onlyArrives = (step: AutomationStudioFlowDraftStep): boolean =>
    startLocation ? automationStudioFlowBootstrapDraftStepGoesToLocation(step, startLocation) : false;
  // An authored step that says which act it does is the model's claim already
  // (`../../flow-draft/step.ts`, `acts`); a claim written in the result for the
  // same act id is not read twice.
  const fromDraft = automationStudioInstructedActDraftClaims(steps);
  const annotated = new Set(fromDraft.map((claim) => claim.action.toLowerCase()));
  const claims = [...fromDraft, ...readClaims(input.result.acts).filter((claim) => !annotated.has(claim.action.toLowerCase()))];
  const assigned = assign(acts, choices, claims);
  // Steps named for any act or choice: a lasting step after a repeat that one names is the next act, not this one's end.
  const named = new Set([...assigned.values()].flatMap((claim) => findStep(steps, claim.step) ?? []));
  const claimed = (step: AutomationStudioFlowDraftStep): boolean => named.has(step);
  const used = new Set<AutomationStudioFlowDraftStep>();
  // The step each act was accepted for, so a choice given the same one is told it is its act's press.
  const actSteps = new Map<string, AutomationStudioFlowDraftStep>();
  const missing: AutomationStudioInstructedActMissing[] = [];
  for (const act of acts) {
    const claim = assigned.get(act.id);
    if (!claim) {
      missing.push({ ...act, reason: "no_step_named" });
      continue;
    }
    const step = findStep(steps, claim.step);
    const said = { step: claim.step.slice(0, 16) };
    const fault = step ? automationStudioInstructedActStepFault(act, step, steps, onlyArrives, claimed) : "no_such_step";
    const after = fault === "span_stops_short" && step ? { after: automationStudioInstructedActSpanStopsShort(step, steps, claimed)!.after.position } : {};
    if (fault || !step) missing.push({ ...act, reason: fault ?? "no_such_step", ...said, ...after });
    else if (used.has(step)) missing.push({ ...act, reason: "step_claimed_twice", ...said });
    else {
      used.add(step);
      actSteps.set(act.id, step);
    }
  }
  for (const choice of choices) {
    const claim = assigned.get(choice.id);
    if (!claim) {
      missing.push({ ...choice, reason: "no_step_named" });
      continue;
    }
    const step = findStep(steps, claim.step);
    const said = { step: claim.step.slice(0, 16) };
    const refused = step ? whyNot(step, onlyArrives(step)) : "no_such_step";
    if (refused || !step) missing.push({ ...choice, reason: refused ?? "no_such_step", ...said });
    else if (used.has(step) && !automationStudioInstructedChoiceSetBy(step, choice)) missing.push({ ...choice, reason: actSteps.get(choice.of) === step ? "choice_is_the_act_step" : "step_claimed_twice", ...said });
    else used.add(step);
  }
  if (!missing.length) return { ok: true, acts };
  // Each act, then its choices, as the instruction asks for them.
  const order = acts.flatMap((act) => [act.id, ...(act.requires ?? []).map((choice) => choice.id)]);
  missing.sort((left, right) => order.indexOf(left.id) - order.indexOf(right.id));
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
      acts: missing.map((act) => ({
        id: act.id,
        kind: act.kind,
        ...("of" in act ? { of: act.of, choice: act.choice } : { verb: act.verb }),
        quote: act.quote,
        ...("plural" in act && act.plural ? { plural: true } : {}),
        ...("consequence" in act && act.consequence && act.reason === "act_consequence_undeclared" ? { consequence: act.consequence } : {}),
        reason: act.reason,
        ...(act.step ? { step: act.step } : {}),
        ...(act.after !== undefined ? { after: act.after } : {})
      })),
      // The steps that could be named: kept, and changed something.
      // Every one of them (user, 2026-09-30): no count cap.
      stepsThatChangedSomething: kept.map((step) => step.id ?? `${step.position}`)
    },
    instruction: INSTRUCTION + REASON_INSTRUCTIONS
      .filter(([reason]) => missing.some((act) => act.reason === reason))
      .map(([, said]) => said)
      .join("")
      + (missing.some((act) => "of" in act) ? CHOICE_INSTRUCTION : "")
  };
}

/**
 * Why this step does not do this act, or nothing when it does as far as the
 * draft can say: in the Flow, an action that changed something, not only the
 * arrival at the start (unless the act is one of opening), not optional,
 * repeated through its last step when over a whole set, and declaring the
 * class its verb names (`claimed`: whether a step is named for any act). The
 * one rule the check and the checklist both apply (`./checklist.ts`).
 */
export function automationStudioInstructedActStepFault(
  act: AutomationStudioInstructedAct,
  step: AutomationStudioFlowDraftStep,
  steps: readonly AutomationStudioFlowDraftStep[],
  onlyArrives: (step: AutomationStudioFlowDraftStep) => boolean,
  claimed: (step: AutomationStudioFlowDraftStep) => boolean
): Exclude<AutomationStudioInstructedActMissing["reason"], "no_step_named" | "no_such_step" | "step_claimed_twice" | "choice_is_the_act_step"> | undefined {
  const refused = whyNot(step, act.kind !== "open" && onlyArrives(step));
  if (refused) return refused;
  const spans = automationStudioInstructedActRepeatSpans(step, steps);
  if (act.plural && !spans.length) return "act_needs_repeat";
  if (act.plural && automationStudioInstructedActSpanStopsShort(step, steps, claimed)) return "span_stops_short";
  const consequence = act.consequence;
  if (!consequence) return undefined;
  // The steps that do the act: its own, or every proposed step of a span that repeats it.
  const doing = spans.length
    ? steps.filter((each) => automationStudioFlowDraftStepIsProposed(each) && spans.some((span) => each.position >= span.from && each.position <= span.to))
    : [step];
  return doing.some((each) => automationStudioDraftStepDeclaresConsequence(each, consequence)) ? undefined : "act_consequence_undeclared";
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
  ["act_needs_repeat", REPEAT_INSTRUCTION],
  ["span_stops_short", SPAN_INSTRUCTION],
  ["act_consequence_undeclared", CONSEQUENCE_INSTRUCTION]
];

/**
 * Why a named step cannot answer anything, whatever it is named for: it was
 * dropped, changed nothing, only arrived (`arrives`, which the caller decides,
 * since arriving is an act of opening), or may be skipped. Undefined when it can.
 */
function whyNot(step: AutomationStudioFlowDraftStep, arrives: boolean): "step_not_kept" | "step_changed_nothing" | "step_only_arrives" | "step_is_optional" | undefined {
  if (step.disposition !== "kept") return "step_not_kept";
  if (step.effect !== "mutate" || !automationStudioFlowDraftStepIsProposable(step)) return "step_changed_nothing";
  if (arrives) return "step_only_arrives";
  if (step.routing?.kind === "optional") return "step_is_optional";
  return undefined;
}

/** The model's claims, in any of the shapes it may reasonably write them. */
function readClaims(value: unknown): AutomationStudioInstructedActClaim[] {
  const text = (item: unknown): string | undefined => typeof item === "string" && item.trim()
    ? item.trim().slice(0, MAX_CLAIM_TEXT)
    : typeof item === "number" && Number.isSafeInteger(item) ? `${item}` : undefined;
  const claims: AutomationStudioInstructedActClaim[] = [];
  if (Array.isArray(value)) {
    for (const item of value) {
      if (!isRecord(item)) continue;
      const step = text(item.step ?? item.stepId ?? item.step_id ?? item.id);
      if (step) claims.push({ action: text(item.action ?? item.act ?? item.name) ?? "", step });
    }
  } else if (isRecord(value)) {
    // `{ "a1": "d7" }`, which is how a model that read a refusal's ids may write it.
    for (const [action, step] of Object.entries(value)) {
      const named = text(step);
      if (named) claims.push({ action: action.slice(0, MAX_CLAIM_TEXT), step: named });
    }
  }
  return claims;
}

/**
 * Which claim answers which act or choice. Only a claim that names one answers
 * it: an act by id, then by a word only its quote holds among acts of its
 * kind, then by verb, then by kind; a choice by id (`a2.quantity`, `a2 size`),
 * or by a word of what it fixes (`./check.ts` `choiceNamedBy`), before any act
 * is named in words -- so "set the quantity" is not taken for a store switch.
 * A claim that names none is left unassigned.
 */
function assign(acts: readonly AutomationStudioInstructedAct[], choices: readonly AutomationStudioInstructedChoice[], claims: readonly AutomationStudioInstructedActClaim[]): Map<string, AutomationStudioInstructedActClaim> {
  const assigned = new Map<string, AutomationStudioInstructedActClaim>();
  const free = [...claims];
  const take = (id: string, matches: (action: string) => boolean): void => {
    if (assigned.has(id)) return;
    const index = free.findIndex((claim) => matches(claim.action.toLowerCase()));
    if (index >= 0) assigned.set(id, free.splice(index, 1)[0]!);
  };
  for (const act of acts) take(act.id, (action) => action === act.id);
  for (const choice of choices) take(choice.id, (action) => choiceId(action) === choice.id);
  for (const choice of choices) take(choice.id, (action) => choiceNamedBy(action, choice, choices, acts));
  for (const act of acts) {
    const own = distinctiveWords(act, acts);
    if (own.length) take(act.id, (action) => own.some((ownWord) => containsWord(action, ownWord)));
  }
  for (const act of acts) take(act.id, (action) => containsWord(action, act.verb));
  for (const act of acts) take(act.id, (action) => KIND_WORDS[act.kind].some((kindWord) => containsWord(action, kindWord)) || action === act.kind);
  return assigned;
}

/** A claim's action read as a choice's id: `a2.quantity`, `a2 quantity`, `a2-size`, `a3.color`. */
function choiceId(action: string): string {
  return action.trim().replace(/[\s._:-]+/gu, ".").replace(/\.colou?r$/u, ".colour").replace(/\.flavou?r$/u, ".flavour");
}

/** Words that name what a choice fixes, beside the word its id carries. */
const CHOICE_WORDS: Readonly<Record<AutomationStudioInstructedChoice["choice"], readonly string[]>> = Object.freeze({
  quantity: ["quantity", "qty", "how many", "amount"],
  variant: ["variant", "option"]
});

/**
 * Whether a claim names a choice in words: it says what the choice fixes
 * ("quantity", "size", "colour", "option"), not the verb of the act it
 * qualifies ("add ... in the 12 Double Rolls size" is the add), and, where
 * several choices fix the same thing, which one -- by its value, its act's id,
 * or a word only its act's quote holds.
 */
function choiceNamedBy(action: string, choice: AutomationStudioInstructedChoice, choices: readonly AutomationStudioInstructedChoice[], acts: readonly AutomationStudioInstructedAct[]): boolean {
  const act = acts.find((each) => each.id === choice.of);
  const fixes = (other: AutomationStudioInstructedChoice): boolean => {
    const own = other.id.slice(other.of.length + 1);
    return containsWord(action, own) || (own === "colour" && containsWord(action, "color")) || CHOICE_WORDS[other.choice].some((word) => containsWord(action, word));
  };
  if (!act || !fixes(choice) || containsWord(action, act.verb)) return false;
  const rivals = choices.filter((other) => other !== choice && other.choice === choice.choice && fixes(other));
  if (!rivals.length) return true;
  return containsWord(action, choice.value.toLowerCase()) || containsWord(action, act.id) || distinctiveWords(act, acts).some((word) => containsWord(action, word));
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
