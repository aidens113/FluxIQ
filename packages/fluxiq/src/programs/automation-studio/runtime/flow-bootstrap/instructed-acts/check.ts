// Whether every lasting act the instruction asks for has a step in the draft
// that does it (`./contracts.ts` says why, and which run it was measured on).
//
// **This verdict no longer refuses a completion (t195).** It refused lane B's
// `choice_is_the_act_step` six times, lane D's run 36 24 times while the
// checklist showed the act done, and in round 4 the napkins named on the
// towels' Add (run 40): each time the Flow never reached the test that would
// have shown what it did. The test from the start, and then a judge of its
// actual results, decide whether the Flow does what it was told; this verdict
// is information beside them. The one rule a completion is still refused for
// is the permission rule (`./permission.ts`): an act whose verb names a class
// a person is asked about needs a step declaring it, or nobody is asked.
// "Refused" below is what this verdict says, not what happens to a completion.
//
// **What is checked, and what cannot be.** Core cannot see what a step did to
// the page, so a claim is checked for what makes it possible: the step exists,
// the model kept it, it is an action that changed something, no other act
// already claimed it, and its own record does not name another act's object
// instead of this one's (`./object-binding.ts`). A model that names the wrong
// press for "save" on a record that names nothing passes this and is caught by
// the run's own verification; a model that names nothing, names a step it
// dropped, names a look, names one press for two acts, or names the towels'
// Add to cart for the napkins is caught here, while it can still act on it
// (live run 40, `run-muq6lqnw-fdfa7aac`), and told which object that step acted
// on and which act asks for it. So is a quantity claimed on a repeat over a
// list, or on presses of the add that are not the count (`./quantity-fault.ts`).
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
// **Every step named for an act is tried, and steps are shown by number.**
// Live run 36 (`run-muq3uozx-3153564b`) named a1 on its list read and on the
// Confirm repeated over it; this check judged only the read, the first step
// naming a1, and dropped the model's own result claims for it, while the
// checklist judged the Confirm and showed a1 done. 24 completions were
// refused for the read. Both now share one loop that tries every step named
// for an act (`./standing.ts`). A refusal names steps by their positions, the
// numbers the draft shows, never by ids the model is not shown, and says so
// when every step named for an act only reads the page.
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
// **A choice made after its act is said, not refused (live run
// `run-murwdp4f-35f976d2`, C2).** The towels' "+" (a2.quantity) on step 16
// came after their Add to cart (a2) on step 12, so the Flow added one pack.
// The verdict carries such a choice under `choicesAfterAct`, on an accepted
// verdict as on a refused one, and the checklist carries the same sentence on
// the choice (`afterAct`, `afterActSaid`), which is how it reaches the model
// beside its draft and the judge of the build's test (`./choice-order.ts`).
//
// **Only a draft is checked.** A plan the model wrote as a script has no steps
// to name, so it is left where it stood before this check existed.
import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../flow-draft/index.ts";
import { automationStudioFlowDraftStepIsProposable } from "../../flow-draft/index.ts";
import { automationStudioFlowBootstrapDraftStepGoesToLocation } from "../reachability/index.ts";
import type {
  AutomationStudioInstructedAct,
  AutomationStudioInstructedActClaim,
  AutomationStudioInstructedActMissing,
  AutomationStudioInstructedActsVerdict,
  AutomationStudioInstructedChoice
} from "./contracts.ts";
import { automationStudioInstructedActs } from "./instruction-acts.ts";
import { AUTOMATION_STUDIO_INSTRUCTED_ACT_KIND_WORDS } from "./kind-words.ts";
import { automationStudioInstructedActsOnSaid } from "./object-binding.ts";
import { AUTOMATION_STUDIO_INSTRUCTED_QUANTITY_INSTRUCTIONS } from "./quantity-fault.ts";
import { automationStudioInstructedChoiceAfterAct, type AutomationStudioInstructedChoiceAfterAct } from "./choice-order.ts";
import { automationStudioInstructedActsStanding, type AutomationStudioInstructedStanding } from "./standing.ts";

/** The issue a missing act refuses completion under. */
export const AUTOMATION_STUDIO_INSTRUCTED_ACT_MISSING_ISSUE_CODE = "bootstrap.instructed_act_missing";

/** The longest claim string read: an act id or a step reference, never the model's prose. */
const MAX_CLAIM_TEXT = 200;
/** The shortest word that can tell one act's object from another's. */
const MIN_DISTINCTIVE_WORD = 4;

/** What a refusal over the acts is told first; `./permission.ts` says it too. */
export const AUTOMATION_STUDIO_INSTRUCTED_ACTS_INSTRUCTION = "Nothing was created and this build is still open. "
  + "missingActs.acts are things the person's instruction asks to be done -- each quote is their own words -- that no step in your Flow is named as doing, and reason says why. "
  + "For each one: if a step in your Flow already does it, say so with amend_draft add on that step and act set to the act's id; if none does, run the node that does it (press the control, set the option, open the page) with add and act on the call. "
  + "Then complete again. A step you added with act already counts for that act; acts in the result, e.g. [{\"action\": \"a1\", \"step\": \"7\"}], names a step by its number and an act by its id, and a claim that names no act answers none. "
  + "Each act needs a step of its own, and it must be one that changed something.";

/** Said only when a claim named a step that only arrived, so the plain refusal stays as it was. */
const ARRIVAL_INSTRUCTION = " A reason of step_only_arrives means the step named only goes to an address -- the page this Flow starts on, or another page of its site -- "
  + "and arriving at a page does not do the act. After arriving, press or set the control that does it (the add, collect, save or set control), keep that step, and name it for the act instead.";

/** Said only when a claim named an optional step. */
const OPTIONAL_INSTRUCTION = " A reason of step_is_optional means the step named is marked optional, so the Flow carries on without it when it fails and the act may never be done: "
  + "make it always run with amend_draft keep on that step, or name a step that always runs.";

/**
 * Said only when a choice of an item is missing: how many, or which size,
 * colour or version. An option the item's page already opens chosen must not be
 * pressed: on crossborder the hub's page opens on Space Grey, pressing a chosen
 * option clears it, and Add to cart then refuses ("Please select a Color."), so
 * this refusal's own "press that option" talked the model into undoing the
 * choice (lane A, `t174-w32` D5). Such a choice is named by the step after
 * which the page showed it chosen.
 */
const CHOICE_INSTRUCTION = " An id like a2.quantity or a2.size is a choice the person made for the item of that act (of): how many of it, or which size, colour, count or version -- quote is their words for it. "
  + "The press that adds does not make it: choose the size or set the quantity with its own step before adding -- press that option, or set the quantity control to the number -- keep that step, and name that step for the choice's id, e.g. {\"action\": \"a2.quantity\", \"step\": \"9\"}. "
  + "If the item's page already shows that option chosen, do not press it -- pressing a chosen option can clear it -- and name for the choice's id the step after which the page showed it chosen, such as the one that opened the item's page. "
  + "A reason of choice_is_the_act_step means the step named is the one named for the act itself, and nothing it was given sets the choice.";

/** Said only when an act over a whole set was claimed by a step that acts once; the way to repeat is the draft's own telling of it. */
const REPEAT_INSTRUCTION = " A reason of act_needs_repeat means the act is asked for every item of a list (plural) and the step named does it once: "
  + "run the step that lists the items (keeping only those to act on), act on one item, then amend_draft repeat over the listing step through the act's last step, and name the repeated step for the act.";

/** Said only when a repeat ended one step before the press that finishes the act on each item. */
const SPAN_INSTRUCTION = " A reason of span_stops_short means the step right after your repeat (after) does part of the act on each item, such as the confirmation the repeated press opened, but runs once after the loop: repeat through it -- amend_draft repeat on the repeat's first step with through set to after.";

/** Said only when an act's verb names a class a person is asked about and no step of it declared that class. */
export const AUTOMATION_STUDIO_INSTRUCTED_ACT_CONSEQUENCE_INSTRUCTION = " A reason of act_consequence_undeclared means the person's words ask for an act of that class of consequence (consequence) and no step that does it declares it: rerun the step that does it declaring that class in its consequences, and keep it; the person will be asked before it happens.";

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
  // (`../../flow-draft/step.ts`, `acts`); a claim written in the result is one
  // more, tried after them, never dropped for them (`./standing.ts`).
  const claims = automationStudioInstructedActClaims({ acts, choices, result: input.result });
  const standing = automationStudioInstructedActsStanding({
    acts,
    steps,
    onlyArrives,
    claimedFor: (id) => (claims.get(id) ?? []).flatMap((claim) => automationStudioInstructedActClaimedStep(steps, claim.step) ?? [])
  });
  // A choice made after its act's step is said, never refused (`./choice-order.ts`).
  const afterAct = choicesAfterAct(choices, standing);
  const missing: AutomationStudioInstructedActMissing[] = [];
  // The positions of the steps named for an act, when each of them only reads the page.
  const reads = new Map<string, number[]>();
  for (const item of [...acts, ...choices]) {
    const stood = standing.get(item.id);
    if (stood && "done" in stood) continue;
    if (!stood) {
      // A claim naming no step of the draft is said back as the model wrote it.
      const unknown = claims.get(item.id)?.[0];
      missing.push(unknown ? { ...item, reason: "no_such_step", step: unknown.step.slice(0, 16) } : { ...item, reason: "no_step_named" });
      continue;
    }
    if (stood.reads) reads.set(item.id, stood.reads);
    // A step is named by its position, the number the draft shows; the model never sees a step's id.
    missing.push({
      ...item,
      reason: stood.fault,
      step: `${stood.step.position}`,
      ...(stood.after !== undefined ? { after: stood.after } : {}),
      ...(stood.actsOn !== undefined ? { actsOn: stood.actsOn } : {}),
      ...(stood.presses ? { presses: stood.presses } : {})
    });
  }
  if (!missing.length) return { ok: true, acts, ...afterAct };
  // Each act, then its choices, as the instruction asks for them.
  const order = acts.flatMap((act) => [act.id, ...(act.requires ?? []).map((choice) => choice.id)]);
  missing.sort((left, right) => order.indexOf(left.id) - order.indexOf(right.id));
  const kept = steps.filter((step) => step.disposition === "kept" && step.effect === "mutate" && automationStudioFlowDraftStepIsProposable(step));
  return {
    ok: false,
    acts,
    ...afterAct,
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
        ...(act.after !== undefined ? { after: act.after } : {}),
        ...(act.actsOn !== undefined ? { actsOn: act.actsOn } : {}),
        ...(act.presses ? { presses: [...act.presses] } : {})
      })),
      // The steps that could be named: kept, and changed something, by the
      // positions the draft shows. Every one of them (user, 2026-09-30): no count cap.
      stepsThatChangedSomething: kept.map((step) => step.position)
    },
    instruction: AUTOMATION_STUDIO_INSTRUCTED_ACTS_INSTRUCTION
      + missing.flatMap((act) => {
        const positions = reads.get(act.id);
        return positions ? [readsSaid(act.id, positions)] : [];
      }).join("")
      + missing.flatMap((act) => act.actsOn !== undefined && act.step
        ? [automationStudioInstructedActsOnSaid({ id: act.id, of: "of" in act ? act.of : act.id, step: act.step, actsOn: act.actsOn, acts })]
        : []).join("")
      + REASON_INSTRUCTIONS
        .filter(([reason]) => missing.some((act) => act.reason === reason))
        .map(([, said]) => said)
        .join("")
      + (missing.some((act) => "of" in act) ? CHOICE_INSTRUCTION : "")
  };
}

/** The choices made on a step after their act's step, as the verdict carries them, or nothing when none is. */
function choicesAfterAct(
  choices: readonly AutomationStudioInstructedChoice[],
  standing: ReadonlyMap<string, AutomationStudioInstructedStanding>
): { choicesAfterAct?: AutomationStudioInstructedChoiceAfterAct[] } {
  const found = choices.flatMap((choice) => {
    const stood = standing.get(choice.id);
    if (!stood || !("done" in stood) || !stood.afterAct) return [];
    return automationStudioInstructedChoiceAfterAct({ id: choice.id, of: choice.of, step: stood.done, actStep: stood.afterAct }) ?? [];
  });
  return found.length ? { choicesAfterAct: found } : {};
}

/**
 * Said for an act every step named for which only reads the page: a read is
 * not the act, and naming the act on it again cannot make it one. Live run 36
 * (`run-muq3uozx-3153564b`) named a1 on its list read, and the read was what
 * 24 completions were refused for.
 */
function readsSaid(id: string, positions: readonly number[]): string {
  const which = positions.length === 1 ? `step ${positions[0]} only reads: drop the act from it` : `steps ${positions.join(", ")} only read: drop the act from them`;
  return ` For ${id}, ${which}, or name it on the step that does the act.`;
}

/** What a refusal adds for each reason that needs more than the plain instruction, in this order. */
const REASON_INSTRUCTIONS: ReadonlyArray<readonly [AutomationStudioInstructedActMissing["reason"], string]> = [
  ["step_only_arrives", ARRIVAL_INSTRUCTION],
  ["step_is_optional", OPTIONAL_INSTRUCTION],
  ["act_needs_repeat", REPEAT_INSTRUCTION],
  ["span_stops_short", SPAN_INSTRUCTION],
  ["act_consequence_undeclared", AUTOMATION_STUDIO_INSTRUCTED_ACT_CONSEQUENCE_INSTRUCTION],
  ...AUTOMATION_STUDIO_INSTRUCTED_QUANTITY_INSTRUCTIONS
];

/**
 * Which of the model's result claims (`result.acts`) name which act or choice,
 * by id. Shared with the one refusal a completion still meets
 * (`./permission.ts`), so a claim is read one way wherever it is read.
 */
export function automationStudioInstructedActClaims(input: {
  acts: readonly AutomationStudioInstructedAct[];
  choices: readonly AutomationStudioInstructedChoice[];
  result: JsonObject;
}): Map<string, AutomationStudioInstructedActClaim[]> {
  return assign(input.acts, input.choices, readClaims(input.result.acts));
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
 * Which claims answer which act or choice. Only a claim that names one answers
 * it: an act by id, then by a word only its quote holds among acts of its
 * kind, then by verb, then by kind; a choice by id (`a2.quantity`, `a2 size`),
 * or by a word of what it fixes (`./check.ts` `choiceNamedBy`), before any act
 * is named in words -- so "set the quantity" is not taken for a store switch.
 * Every claim naming an act or choice by its id answers it; in words, each
 * takes the first claim that names it, and a claim left over then answers the
 * one act or choice it names, when it names only one. A claim that names none,
 * or names two alike, is left unassigned.
 */
function assign(acts: readonly AutomationStudioInstructedAct[], choices: readonly AutomationStudioInstructedChoice[], claims: readonly AutomationStudioInstructedActClaim[]): Map<string, AutomationStudioInstructedActClaim[]> {
  const assigned = new Map<string, AutomationStudioInstructedActClaim[]>();
  const free = [...claims];
  const give = (id: string, given: readonly AutomationStudioInstructedActClaim[]): void => {
    for (const claim of given) free.splice(free.indexOf(claim), 1);
    if (given.length) assigned.set(id, [...(assigned.get(id) ?? []), ...given]);
  };
  const named = (matches: (action: string) => boolean) => free.filter((claim) => matches(claim.action.toLowerCase()));
  for (const act of acts) give(act.id, named((action) => action === act.id));
  for (const choice of choices) give(choice.id, named((action) => choiceId(action) === choice.id));
  // Named in words, tier by tier: the first tier that names anything decides.
  const tiers: Array<Array<readonly [string, (action: string) => boolean]>> = [
    choices.map((choice) => [choice.id, (action: string) => choiceNamedBy(action, choice, choices, acts)] as const),
    acts.map((act) => {
      const own = distinctiveWords(act, acts);
      return [act.id, (action: string) => own.some((ownWord) => containsWord(action, ownWord))] as const;
    }),
    acts.map((act) => [act.id, (action: string) => containsWord(action, act.verb)] as const),
    acts.map((act) => [act.id, (action: string) => AUTOMATION_STUDIO_INSTRUCTED_ACT_KIND_WORDS[act.kind].some((kindWord) => containsWord(action, kindWord)) || action === act.kind] as const)
  ];
  for (const tier of tiers) {
    for (const [id, matches] of tier) if (!assigned.has(id)) give(id, named(matches).slice(0, 1));
  }
  for (const claim of [...free]) {
    const action = claim.action.toLowerCase();
    const owners = tiers.map((tier) => tier.filter(([, matches]) => matches(action))).find((found) => found.length);
    if (owners?.length === 1) give(owners[0]![0], [claim]);
  }
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
export function automationStudioInstructedActClaimedStep(steps: readonly AutomationStudioFlowDraftStep[], named: string): AutomationStudioFlowDraftStep | undefined {
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
