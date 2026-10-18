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
// cut too, and the control is said in the same words the feedback gives.
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
import { AUTOMATION_STUDIO_DECLARED_CONSEQUENCES_METADATA_KEY, automationStudioNodeSideEffectClass, type AutomationStudioGraphExecutionTrace, type AutomationStudioNodeAttemptTrace } from "../../executor/index.ts";
import type { AutomationStudioCandidateTrialAct } from "../../flow-bootstrap/candidate/index.ts";
import type { AutomationStudioSiteResetSpot, AutomationStudioSiteResetTrialActPlace } from "../../flow-bootstrap/site-reset/index.ts";
import { automationStudioAttemptSettled } from "../../flow-change/index.ts";
import { automationStudioModelFacingControlWords } from "../../llm/model-facing/index.ts";
import { automationStudioTrialExecutedSteps } from "./executed-steps.ts";

/** A trial's act, with where its step sat and what it made when its state diff said so (header, t598). */
export type AutomationStudioCandidateTrialLandedAct = AutomationStudioCandidateTrialAct & AutomationStudioSiteResetTrialActPlace;

/** Each lasting act the trial's steps landed, in the order they ran. */
export function automationStudioCandidateTrialLandedActs(trace: AutomationStudioGraphExecutionTrace | undefined, graph: AutomationStudioFlowArtifact | undefined): AutomationStudioCandidateTrialLandedAct[] {
  const nodes = new Map((graph?.nodes ?? []).map((node) => [node.id, node]));
  const acts: AutomationStudioCandidateTrialLandedAct[] = [];
  /** Every item an earlier step's pages listed: none of them is one a later step created (header). */
  const seen = new Set<string>();
  automationStudioTrialExecutedSteps(trace?.attempts ?? []).forEach(({ attempt }, index) => {
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
    const control = automationStudioModelFacingControlWords(node.parameterValues);
    const spot = spotOf(attempt);
    acts.push({ step: index + 1, definitionId: attempt.definitionId, ...(node.label ? { label: node.label } : {}), ...(control ? { control } : {}), consequences, ...(possible ? { possible: true as const } : {}), ...(spot ? { spot } : {}), ...(created.length ? { created } : {}) });
  });
  return acts;
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

/** The diff's `spot`, where it gave a token for the item or the dialog the step's control sat in, or for what it and its page are about (header, t719). */
function spotOf(attempt: AutomationStudioNodeAttemptTrace): AutomationStudioSiteResetSpot | undefined {
  const spot = attempt.stateRefs?.stateDiff?.spot;
  if (!isObject(spot)) return undefined;
  const item = token(spot.item), dialog = token(spot.dialog), subject = token(spot.subject), page = token(spot.page), scope = token(spot.scope);
  return item || dialog || subject || page || scope ? { ...(item ? { item } : {}), ...(dialog ? { dialog } : {}), ...(subject ? { subject } : {}), ...(page ? { page } : {}), ...(scope ? { scope } : {}) } : undefined;
}

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
