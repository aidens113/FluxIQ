// The lasting acts a trial left on the site (t462), so the build can undo them
// before its next trial (`../../flow-bootstrap/site-reset/`).
//
// Read off the trial's own trace and the graph it ran, never the page: a step
// counts when its final attempt settled `succeeded` (its act landed), it was
// neither skipped nor done by the page already showing its state (`stateHeld`:
// nothing was acted), and its node carries the step's declared lasting
// consequences (`declaredConsequences`, `../../executor/defensive/lasting-act.ts`)
// with at least one class Core knows. Steps are numbered as the trial's
// feedback numbers them (`./executed-steps.ts`), every step, past the listing's
// cut too, and the control is said in the same words the feedback gives
// (`./step-control.ts`: a read of changing words by what it read, t748).
//
// **Only an act whose effect appeared (t475).** A step that "succeeded" while
// its page showed nothing new -- its traced diff, on the same document, added
// and removed nothing -- or whose effect check found it had not landed, left
// nothing on the site to undo, and is not answered. Lane B round 10
// (`run-mv5tusj4-b7ee0630`) was asked to undo an Add to cart that added
// nothing, and the model removed a line the cart held before the build began.
// Where no diff was traced, the step counts as before.
//
// **A step that declared none, and changed its own page, is possibly lasting
// (t593).** On A8 crossborder `run-mv8c76i3-61b9ca89` a coupon press declared
// no lasting consequence, so no trial answered it and nothing ever put it back.
// A domain step (never one of Core's own) whose node declared `none` (`[]`),
// that succeeded and whose traced diff shows its own page changed -- the same
// document, something added or removed -- is answered too, with no classes and
// marked `possible`. Only positive evidence counts: no diff, a move to another
// page, or an effect check that found nothing landed answers nothing. A
// project build's ledgers record it as possibly lasting and never ask for it
// (`../../flow-bootstrap/site-reset/ledger.ts`); a ledger that does not record
// those, and the whole-candidate gate, which keeps declared acts only, drop it.
//
// **Where a trial's act sat, and what it made (t598).** A trial's act used to be
// recorded with no item, so on a site with no start hook every undo of it was
// refused `candidate.undo_wrong_target` and a reset could only name it under
// `cannotUndo`: with t597 every passing trial there left one, a list line it
// added among them. An act made while exploring is tied to its own item by the
// declaration's `control.item` and by the items its own page showed new
// (`../../flow-bootstrap/site-reset/act-places.ts`). A trial puts no
// declaration through the build's gate, so the same two things are read off
// the step's own state diff, the one the host runtime's `inspectStateDiff`
// wrote from the snapshots just before and just after it, in the forms a
// declaration and a `startState` read already take:
//
// - `spot`: `{ item?, dialog?, subject?, page? }`, the opaque tokens of where
//   the step's control sat on the page before it, and of what it and that page
//   are about (t719), which tie an undo elsewhere -- the basket line an add on
//   a detail page made -- to the step's act;
// - `items`: `{ before, after }`, the opaque tokens of the items -- rows, cards,
//   list lines -- each of those two pages listed.
//
// **The acted control's place and state (L1 reset settlement).** The spot also
// carries `resource`, `place` and `state`, and the diff `controls`: `{ page,
// location?, before, after }`, the state counts the page showed at the
// control's place just before and just after the step, so the ledger can see a
// toggle come back. Every token is opaque, every count a positive safe integer,
// at most 2,000 states a side; anything else drops `controls` and keeps the
// act. `location` is the page's own address, as a read carries it beside its
// `scope`: in a single-subflow plan the trial's act lands in a ledger that has
// read no page yet, which then knows where to look for that toggle (L1 d7). A
// location that is not a bounded single-line string is dropped, and the counts
// kept.
//
// **The address the trial executed with (t738).** The trace read here is the
// saved one, which withholds every value the run resolved out of state, and
// `stateDiff` is under its withholding: a press on a page the trial reached by a
// row-bound address (`url: $row.link`) read its location as the withholding
// marker, and no settle clause could name that page (rerun round 2
// `run-mvgf801u-cc23575e`, 24 such clauses). The location alone is taken from
// the trace the run executed, kept in memory beside the saved one
// (`../../executor/executed-locations/`); every other field of the act -- its
// counts, its spot, its control's words -- is the saved trace's, so nothing
// else withheld reaches the act. Every caller (`./run.ts`,
// `../subflow-trial/run.ts`, `../project-build/entry-preparation.ts`) reads its
// acts here, so each gets the address. The saved trace is not changed.
//
// The rule is exploration's, positive evidence only (t479): an item is one the
// step created only when the step stayed on its document, the page before it
// listed its items, that list lacked the item, and no earlier step of the same
// trial had shown it. A token that is not a short opaque digest is not one.
// Absent, the act is recorded as before, with no item.
//
// **A called part's steps name their items too (t684).** A plan of several
// subflows runs each part through a Call Subflow step, and the run lists the
// call before the steps it ran (`../summaries/frame-attempts.ts`). The call's
// own diff spans its whole child: its page after lists every item the child's
// steps made. Counting that page as an earlier step's would mark each of them
// already shown, so the part's step that made one named none, and every reset
// undo of it was refused `candidate.undo_wrong_target` (t679, open question 1).
// A call's page before is still before its child; its page after is not, and
// the child's own steps, and the steps after the call, list it themselves.
//
// **A looped step's passes are named (t748).** Each pass of a loop's body is its
// own step and its own act, but on job round 4 (`run-mvgw1854-5d10955b`) four
// passes of one wordless press read alike, `trial step N "save the job"`, and
// the model sent its undos at the wrong act. A step that ran in more than one
// loop pass of the trial (`./executed-steps.ts` `pass`) carries `pass`: which of
// the passes it ran in, counting every one it ran in, landed or not, of how
// many. A step that ran in one pass, or in none, carries nothing.
//
// **A step's reset witness travels with its act (t751, R3 door 2).** The stamp
// Core's one admission gave a lasting step at submission is on its Flow node's
// metadata (`AUTOMATION_STUDIO_RESET_WITNESS_METADATA_KEY`,
// `../../flow-bootstrap/adaptation.ts`); each act the node lands carries it as
// `witness`, read through `automationStudioSiteResetWitnessStampValid`, so a
// malformed value is dropped and the act kept, as with every other field.
//
// **Core's own steps leave nothing (t598).** A step of one of Core's own nodes
// that acts on nothing outside the run (`automationStudioNodeSideEffectClass`
// `none`: a wait, a branch, a variable) is never a lasting act, whatever it
// declares: a `create_new` on a wait is ignored, not recorded, because nothing
// on the site carries it and no undo could ever be tied to it. A Core node that
// does reach outside -- a recorded action (`builtin.policy.action`), a database
// write -- is read as a domain step is.

import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioFlowArtifact } from "../../../model/index.ts";
import { automationStudioConsequencesInOrder, isAutomationStudioActionConsequence } from "../../action-permissions/index.ts";
import { AUTOMATION_STUDIO_DECLARED_CONSEQUENCES_METADATA_KEY, automationStudioExecutedLocations, automationStudioNodeSideEffectClass, type AutomationStudioGraphExecutionTrace, type AutomationStudioNodeAttemptTrace } from "../../executor/index.ts";
import { AUTOMATION_STUDIO_RESET_WITNESS_METADATA_KEY, type AutomationStudioCandidateTrialAct } from "../../flow-bootstrap/candidate/index.ts";
import { automationStudioSiteResetWitnessStampValid } from "../../flow-bootstrap/reset-admission/index.ts";
import { automationStudioSiteResetValueWitnessOf } from "../../flow-bootstrap/reset-settlement/index.ts";
import type { AutomationStudioSiteResetSpot, AutomationStudioSiteResetTrialActPlace } from "../../flow-bootstrap/site-reset/index.ts";
import { automationStudioAttemptSettled } from "../../flow-change/index.ts";
import { automationStudioTrialExecutedSteps } from "./executed-steps.ts";
import { automationStudioTrialStepControl } from "./step-control.ts";

/** A trial's act, with where its step sat and what it made when its state diff said so (header, t598). */
export type AutomationStudioCandidateTrialLandedAct = AutomationStudioCandidateTrialAct & AutomationStudioSiteResetTrialActPlace;

/** Each lasting act the trial's steps landed, in the order they ran. */
export function automationStudioCandidateTrialLandedActs(trace: AutomationStudioGraphExecutionTrace | undefined, graph: AutomationStudioFlowArtifact | undefined): AutomationStudioCandidateTrialLandedAct[] {
  const nodes = new Map((graph?.nodes ?? []).map((node) => [node.id, node]));
  const acts: AutomationStudioCandidateTrialLandedAct[] = [];
  /** Every item an earlier step's pages listed: none of them is one a later step created (header). */
  const seen = new Set<string>();
  const steps = automationStudioTrialExecutedSteps(trace?.attempts ?? []);
  const passes = passesOf(steps);
  steps.forEach(({ attempt }, index) => {
    const listed = itemsOf(attempt);
    const created = createdBy(attempt, listed, seen);
    // A called part's page after comes after its own steps, which list it themselves (header, t684).
    for (const item of [...(listed?.before ?? []), ...(attempt.subflowTarget ? [] : listed?.after ?? [])]) seen.add(item);
    if (attempt.subflowTarget || attempt.stateHeld || attempt.skipped || automationStudioAttemptSettled(attempt).status !== "succeeded" || noEffectSeen(attempt)) return;
    const node = nodes.get(attempt.nodeId);
    // Core's own step, acting on nothing outside the run, leaves nothing, whatever it declared (header).
    if (!node || (attempt.definitionId.startsWith(CORE_NODE_PREFIX) && automationStudioNodeSideEffectClass(node) === "none")) return;
    const declared = node.metadata?.[AUTOMATION_STUDIO_DECLARED_CONSEQUENCES_METADATA_KEY];
    const consequences = Array.isArray(declared) ? automationStudioConsequencesInOrder(declared.filter(isAutomationStudioActionConsequence)) : [];
    // Declared none, and its own page changed: possibly lasting (header).
    const possible = !consequences.length && Array.isArray(declared) && declared.length === 0 && changedInPlace(attempt);
    if (!consequences.length && !possible) return;
    const control = automationStudioTrialStepControl(node, attempt);
    const spot = spotOf(attempt);
    const collections = collectionsOf(attempt);
    const controls = controlsOf(attempt);
    const values = valuesOf(attempt);
    // The step's stamp from submission, where its node carries a valid one (header, t751).
    const witness = node.metadata?.[AUTOMATION_STUDIO_RESET_WITNESS_METADATA_KEY];
    acts.push({ step: index + 1, definitionId: attempt.definitionId, ...(node.label ? { label: node.label } : {}), ...(control ? { control } : {}), consequences, ...(possible ? { possible: true as const } : {}), ...(spot ? { spot } : {}), ...(collections ? { collections } : {}), ...(controls ? { controls } : {}), ...(values ? { values } : {}), ...(created.length ? { created } : {}), ...(passes[index] ? { pass: passes[index] } : {}), ...(automationStudioSiteResetWitnessStampValid(witness) ? { witness: { ...witness } } : {}) });
  });
  return acts;
}

/** Each step's pass among the loop passes its node ran in this trial, where it ran in more than one (header, t748). */
function passesOf(steps: ReturnType<typeof automationStudioTrialExecutedSteps>): Array<{ number: number; of: number } | undefined> {
  const ran = new Map<string, number>();
  for (const step of steps) if (step.pass) ran.set(step.attempt.nodeId, (ran.get(step.attempt.nodeId) ?? 0) + 1);
  const counted = new Map<string, number>();
  return steps.map((step) => {
    const of = ran.get(step.attempt.nodeId) ?? 0;
    if (!step.pass || of < 2) return undefined;
    const number = (counted.get(step.attempt.nodeId) ?? 0) + 1;
    counted.set(step.attempt.nodeId, number);
    return { number, of };
  });
}

/** The step's own trace says its act left nothing: its effect check found it not landed, or its diff on the same document is empty (header). */
function noEffectSeen(attempt: AutomationStudioNodeAttemptTrace): boolean {
  if (attempt.effectCheck?.result === "not_landed") return true;
  const diff: JsonObject | undefined = attempt.stateRefs?.stateDiff;
  if (!diff) return false;
  const moved = diff.documentChanged === undefined ? diff.locationChanged === true : diff.documentChanged === true;
  return !moved && !written(diff.added) && !written(diff.removed);
}

/** Core's own nodes; those whose side-effect class is `none` act on nothing outside the run (header). */
const CORE_NODE_PREFIX = "builtin.";
/** An opaque place token, in the form a declaration's `control.item` takes (`../../action-permissions/declaration.ts`): a digest, so short. */
const PLACE_TOKEN = /^[A-Za-z0-9:_-]{1,128}$/u;
/** More items than any page lists is no list of a page's items. */
const MAX_ITEMS = 2_000;

/** The diff's `spot`, where it gave a token for the item or the dialog the step's control sat in, for what it and its page are about (t719), or for the control's own place and state (L1, header). */
function spotOf(attempt: AutomationStudioNodeAttemptTrace): AutomationStudioSiteResetSpot | undefined {
  const spot = attempt.stateRefs?.stateDiff?.spot;
  if (!isObject(spot)) return undefined;
  const read: AutomationStudioSiteResetSpot = {};
  for (const key of SPOT_KEYS) {
    const value = token(spot[key]);
    if (value) read[key] = value;
  }
  return Object.keys(read).length ? read : undefined;
}

/** Every token a step diff's `spot` may carry, in the form a declaration's `control` takes them. */
const SPOT_KEYS = ["item", "dialog", "subject", "page", "scope", "resource", "place", "state"] as const satisfies ReadonlyArray<keyof AutomationStudioSiteResetSpot>;

/** The diff's `items`: the tokens the page before the step and the page after it listed; a side not listed is absent (header). */
function itemsOf(attempt: AutomationStudioNodeAttemptTrace): { before?: string[]; after?: string[] } | undefined {
  const items = attempt.stateRefs?.stateDiff?.items;
  if (!isObject(items)) return undefined;
  const before = tokens(items.before), after = tokens(items.after);
  return before || after ? { ...(before ? { before } : {}), ...(after ? { after } : {}) } : undefined;
}

/** The items the step's own page showed new: on the same document, listed after and not before, and shown by no earlier step (header). */
function createdBy(attempt: AutomationStudioNodeAttemptTrace, listed: { before?: string[]; after?: string[] } | undefined, seen: ReadonlySet<string>): string[] {
  const diff: JsonObject | undefined = attempt.stateRefs?.stateDiff;
  if (!diff || !listed?.before || !listed.after) return [];
  const moved = diff.documentChanged === undefined ? diff.locationChanged === true : diff.documentChanged === true;
  if (moved) return [];
  const before = new Set(listed.before);
  return listed.after.filter((item) => !before.has(item) && !seen.has(item));
}

function token(value: JsonValue | undefined): string | undefined {
  return typeof value === "string" && PLACE_TOKEN.test(value) ? value : undefined;
}

/** Every entry an opaque token, or no list at all: a list with one malformed entry is not read (header). */
function tokens(value: JsonValue | undefined): string[] | undefined {
  if (!Array.isArray(value) || value.length > MAX_ITEMS) return undefined;
  const read = value.map(token);
  return read.every((entry): entry is string => entry !== undefined) ? [...new Set(read)] : undefined;
}

function isObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The step's own trace shows its page changed where it stood: a diff on the same document that added or removed something (header). */
function changedInPlace(attempt: AutomationStudioNodeAttemptTrace): boolean {
  const diff: JsonObject | undefined = attempt.stateRefs?.stateDiff;
  if (!diff) return false;
  const moved = diff.documentChanged === undefined ? diff.locationChanged === true : diff.documentChanged === true;
  return !moved && (written(diff.added) || written(diff.removed));
}

/** A diff side the domain wrote something on. */
function written(value: JsonValue | undefined): boolean {
  return typeof value === "string" ? value.trim().length > 0 : Array.isArray(value) ? value.length > 0 : false;
}


/** Immediate complete inventory tokens from the domain; malformed or partial maps cannot prove a transfer. */
function collectionsOf(attempt: AutomationStudioNodeAttemptTrace): AutomationStudioSiteResetTrialActPlace["collections"] {
  const witness = attempt.stateRefs?.stateDiff?.collections;
  if (!isObject(witness)) return undefined;
  const read = (value: JsonValue | undefined): NonNullable<AutomationStudioSiteResetTrialActPlace["collections"]>["before"] | undefined => {
    if (!Array.isArray(value) || value.length > MAX_ITEMS) return undefined;
    const found: NonNullable<AutomationStudioSiteResetTrialActPlace["collections"]>["before"] = [];
    const scopes = new Set<string>();
    for (const entry of value) {
      if (!isObject(entry)) return undefined;
      const scope = token(entry.scope), group = token(entry.group), subjects = tokens(entry.subjects);
      if (!scope || !group || !subjects || !Array.isArray(entry.subjects) || entry.subjects.length !== subjects.length || scopes.has(scope) || !isObject(entry.states)) return undefined;
      const states: Record<string, string> = {};
      for (const subject of subjects) {
        const state = token(entry.states[subject]);
        if (!state) return undefined;
        states[subject] = state;
      }
      if (Object.keys(entry.states).length !== subjects.length) return undefined;
      scopes.add(scope);
      found.push({ scope, group, subjects, states });
    }
    return found;
  };
  const before = read(witness.before), after = read(witness.after);
  return before && after ? { before, after } : undefined;
}

/** The diff's `controls` at the step control's place, when its page token and both sides are well formed (header, L1); otherwise none. */
function controlsOf(attempt: AutomationStudioNodeAttemptTrace): AutomationStudioSiteResetTrialActPlace["controls"] {
  const witness = attempt.stateRefs?.stateDiff?.controls;
  if (!isObject(witness)) return undefined;
  const page = token(witness.page), before = countsOf(witness.before), after = countsOf(witness.after);
  if (!page || !before || !after) return undefined;
  // The address the run executed with, where the saved trace withheld it; the location alone (header, t738).
  const location = locationOf(automationStudioExecutedLocations.of(witness) ?? witness.location);
  return { page, ...(location ? { location } : {}), before, after };
}

/** The diff's shown values the step replaced (t772 value witness), at the address the run executed it with, as `controlsOf` reads it; otherwise none. */
function valuesOf(attempt: AutomationStudioNodeAttemptTrace): AutomationStudioSiteResetTrialActPlace["values"] {
  const witness = attempt.stateRefs?.stateDiff?.values;
  if (!isObject(witness)) return undefined;
  return automationStudioSiteResetValueWitnessOf(witness, locationOf(automationStudioExecutedLocations.of(witness) ?? witness.location));
}

/** The longest location a read or a trial step carries (`../../flow-bootstrap/start-location.ts`). */
const MAX_LOCATION = 2_048;

/** A page's address: a non-empty single-line string no longer than a start location, or none (header). */
function locationOf(value: JsonValue | undefined): string | undefined {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_LOCATION && !/[\u0000-\u001f\u007f]/u.test(value) ? value : undefined;
}

/** State tokens and their counts, every token opaque and every count a positive safe integer, or none. */
function countsOf(value: JsonValue | undefined): Record<string, number> | undefined {
  if (!isObject(value)) return undefined;
  const entries = Object.entries(value);
  if (entries.length > MAX_ITEMS) return undefined;
  const counts: Record<string, number> = {};
  for (const [state, count] of entries) {
    if (!token(state) || typeof count !== "number" || !Number.isSafeInteger(count) || count < 1) return undefined;
    counts[state] = count;
  }
  return counts;
}
