// The draft as one evidence entry, always shown whole.
//
// The draft is not an evidence record: it is the model's own list of what it
// did, placed beside the evidence the way the budget entry is, so however long
// the exploration runs, the list of what it did is in front of the model when
// it writes the result.
//
// **One field here is page content: `control`.** Every other field is Core's
// own bookkeeping, the argument the model itself wrote when it asked for the
// action, or -- as `does` -- the bound domain's own wording of that call
// (`./step.ts`, `words`): the name of the control a handle stood for and the
// words the call typed or looked for, made from names the model was already
// shown when it chose the call. `control` is the words of the control a step
// acted on, which the call's own result had already shown the model, screened
// and bounded on the way in (`./control-words.ts`). Both answer one defect: a
// handle alone let live runs `run-muqiho5c-e830ce01` and `run-muqiojz4-04a7a8fc`
// take a press of "Not now" or a "×" for Add to cart. They name the same
// control, so a line shows `control` only when the domain gave no `does`.
//
// Every step is listed, with the argument it ran with, and the guidance is
// told in full -- a look too, as `disposition: look`. A look holds a step
// number like any other step, because a position is an index into the whole
// draft (`./step.ts`), so a draft that hid its looks showed the model numbers
// with gaps it could not see across: live run `run-mup2i28c-6c7fc209` was shown
// steps 2, 3 and 4 -- 1 and 5 were looks -- and its `5 add a2` landed on the
// look after them. The entry is built afresh for every decision from the draft
// as it then stands (`../llm/decision-context/shown.ts`), so listing every step
// is what makes it change after every call, a look included.
// There used to be a ladder here that shrank the entry to a byte
// budget -- packed rows, shorter guidance, arguments over 512 bytes replaced
// by a marker, arguments withheld oldest first, and finally the oldest steps
// counted instead of listed. It is gone (2026-09-30): the only bound on a
// request is the model's context window, enforced loudly before the request
// is sent, and nothing is trimmed to fit (`../llm/context-window.ts`).
//
// **Written steps and bindings (t252).** A step may be written rather than run
// (`written: true`, `./step.ts`), and its parameters may carry bindings. The
// draft stores a binding as the executor's state binding and shows it back in
// the form the model writes (`./binding-render.ts`), so the model reads one
// vocabulary; the Flow inputs those bindings declare are listed once for the
// draft (`inputs`, `./flow-inputs.ts`).

import type { JsonObject, JsonValue } from "../../../../core/index.ts";
import { automationStudioFlowDraftRenderBindings } from "./binding-render.ts";
import { automationStudioFlowDraftInputs } from "./flow-inputs.ts";
import type { AutomationStudioFlowDraftStep } from "./step.ts";
import { automationStudioFlowDraftStepIsAction, automationStudioFlowDraftStepIsProposed } from "./step.ts";
import type { AutomationStudioFlowDraftStepRouting } from "./routing.ts";
import { automationStudioFlowDraftStepById, automationStudioFlowDraftStepId } from "./routing.ts";
import { automationStudioFlowDraftReplayOutcomeWord } from "./verify-only.ts";

// The per-item sentence in both tellings names the three steps in order and
// where the repeat goes. Live run 37 (`run-muq5v4zg-39182b58`) read "add the
// act done to one item, then amend_draft repeat over the listing step" as a
// repeat on the listing, sent `13 repeat over 13` with no press in the draft,
// and never pressed a Confirm.

/** The entry the draft is shown under. */
export const AUTOMATION_STUDIO_FLOW_DRAFT_TOOL_ID = "core.flow_draft";

const DRAFT_CODE = "llm_evidence_loop.draft";
const DRAFT_INSTRUCTION = "The Flow you are building, in the order you built it: every step here is something you actually ran, with the argument it ran with. Every step whose inResult is true is a step of the finished Flow, so there is nothing to write down at the end and nothing to confirm. A did_not_work step is already out: only rerun changes it. A step whose disposition is look only looked: it is listed so its number shows, and it is never in the Flow and does no act. Correct the draft with amend_draft: drop a step that should not be there, exploratory for one you ran only to look, reorder to move one, rerun to do one again with a corrected argument. To do one act to every item of a list, run the step listing the items with a where that keeps only those to act on, do the act to one item it kept -- that row's own control -- then put repeat on that act with over the listing step: the repeat goes on the act, never on the listing, and the Flow does the rest, so never act on the others yourself. A listing that already keeps the right rows is not run again. A step you want and have not run yet is run, not written. Getting to the page is part of the work: going somewhere, dismissing what covers it, typing a search and pressing it are never exploratory; only a page you opened to read and moved on from is.";

// The same draft where the model authors it (user, 2026-09-30: "IT SHOULD
// ONLY ADD STEPS IN A WAY THAT MAKE AN INTELLIGENT FLOW!"): a step that ran is
// evidence, marked `taken`, and is in the Flow only once the model adds it
// (`./step.ts`). The acts checklist beside it (`acts`) is what "ready" means
// (audit A1, cause 1), so the telling names it.
const AUTHORED_INSTRUCTION = "The Flow you are authoring. Every step you run is listed here as evidence (disposition taken) and is not in the Flow until you add it: add true on the call that runs it, or amend_draft add naming its step. Run any node configuration to see what it does; what you add is your choice. You may also write a step without running it -- core.run_node with write true, which adds it -- once what you have seen is enough to know its node and parameters: it is listed with written true, it was checked and not done, and the test runs it. inResult true marks a step of the Flow. Add only what the finished Flow needs, in the order it needs it: getting to the page, dismissing what covers it, and the acts themselves. Getting to a control includes the press that opened the chooser, drawer or menu it is inside: adding the control's step adds that press with it if you have not. Never add a look, a failed try, a detour, or a second copy of a step already added. acts lists what the person asked to be done, in their words: say which act a step does with act (a1, a2 ...) when you add it, and done then names that step. does, beside a step, names the control it acted on and the words it typed: name an act only on a step whose does is that act. Repetitive work is a loop, not a sequence: never do it to every item yourself. To do one act to every item of a list, three steps in this order: add the step listing them, with a where keeping only those to act on; do or write the act on one row it kept -- that row's own control -- and add that press with its act; then send amend_draft {\"step\": <that press>, \"change\": \"repeat\", \"over\": <the listing>}, and never act yourself on the items your listing left out. The repeat goes on the press, never on the listing, and a listing that already keeps the right rows is not run again. For an act with a lasting effect on the items a loop keeps, write it rather than doing it to one real item, so the build changes nothing the Flow should not. A value that changes between runs or rows is bound, never typed in: {\"$input\": <name>, \"test\": <value>} for a value the person gave (test is that value, and the Flow takes it as an input), {\"$row\": <field>} for a field of the row a repeat is on. Write a step with them, or send amend_draft bind on a step you ran to lift its value into one: parameters show bindings in these forms, and inputs lists the Flow's inputs with their test values and the steps using them. For something only sometimes there, add it and mark it optional: a cookie banner, a sign-up popup or anything else that covers the page may not be there the next time the Flow runs, so its dismissal is optional. reorder moves a step, drop takes one out, rerun does one again with a corrected argument in its place. Complete when the Flow does what the person asked: it is then tested from its start and judged on what it does, and acts done is your own reading, not the bar. The test runs a repeated step once for each row its listing returned, and passes beside it says how many times it ran. A did_not_work step can only be rerun. A step whose disposition is look only looked: it is listed so its number shows, and it can never be added or do an act.";

/**
 * The draft as one entry, or nothing when the draft holds no step a result
 * could be made of and no acts checklist. Every step is listed with its
 * argument, at the number an amendment names it by.
 */
export function automationStudioFlowDraftEntry(input: {
  steps: readonly AutomationStudioFlowDraftStep[];
  /** Whether the model authors the draft; absent, the transcript telling (`./step.ts`, `taken`). */
  authored?: boolean | undefined;
  /** The acts checklist, carried whole on every entry. */
  acts?: JsonValue | undefined;
}): { callId: string; toolId: string; value: JsonValue } | undefined {
  // Every step, whether or not it is in the result: an extraction changes
  // nothing on the page and is the whole point of a scraping Flow, so "did it
  // mutate" is not the question. A step the model withdrew stays listed,
  // because the receipt is what makes the draft checkable -- `inResult` on
  // each line says which way it went -- and a look stays listed so every
  // number an amendment can name is one the model was shown (header).
  const listed = input.steps;
  const acts = input.acts;
  const inputs = automationStudioFlowDraftInputs(listed).inputs;
  // No step yet, and still a checklist: the model is shown what it is to do
  // from the first decision. Looks alone and no checklist are still nothing
  // to show: nothing in them is an edit the model could make.
  if (!listed.some(automationStudioFlowDraftStepIsAction) && acts === undefined) return undefined;
  const value: JsonObject = {
    code: DRAFT_CODE,
    ...(acts === undefined ? {} : { acts }),
    steps: listed.map((step) => stepLine(step, listed)),
    // The Flow's inputs, declared by the bindings its steps carry (`./flow-inputs.ts`).
    ...(inputs.length ? { inputs: inputs.map((entry) => ({ name: entry.name, test: entry.test, steps: entry.steps })) } : {}),
    instruction: (input.authored ? AUTHORED_INSTRUCTION : DRAFT_INSTRUCTION) + (listed.some((step) => step.checkedCandidate) ? " A checkedCandidate is an exception to the recorded runs: its current configuration was checked, not performed; its act claims are intentions. priorExecution identifies the original configuration that performed the earlier effect, not this candidate. A verified/present test of a candidate establishes the check's result, never execution of its effect." : "")
  };
  return { callId: AUTOMATION_STUDIO_FLOW_DRAFT_TOOL_ID, toolId: AUTOMATION_STUDIO_FLOW_DRAFT_TOOL_ID, value };
}

function stepLine(step: AutomationStudioFlowDraftStep, all: readonly AutomationStudioFlowDraftStep[]): JsonObject {
  return {
    step: step.position,
    actionId: step.actionId,
    // A stored binding is shown as the form the model writes (`./binding-render.ts`).
    input: automationStudioFlowDraftRenderBindings(step.input),
    // Written, not run: checked and frozen by the domain, nothing performed (`./step.ts`).
    ...(step.written ? { written: true } : {}),
    ...(step.checkedCandidate ? { checkedCandidate: { ...step.checkedCandidate, performed: false }, actEvidence: "intended" } : {}),
    // Only provenance identity is model-facing; private resolved parameters
    // and state/output evidence of the old execution stay on the internal record.
    ...(step.priorExecution ? { priorExecution: { ...(step.priorExecution.callId ? { callId: step.priorExecution.callId } : {}), performed: true, configuration: "original" } } : {}),
    // What the call named, in the domain's words: the control a handle in
    // `input` stood for, and the words typed or looked for (`./step.ts`,
    // `words`). A handle is a name for a control on one page, so without this
    // every press read alike and run `run-muqiojz4-04a7a8fc` named a "×" as
    // its add-to-cart act.
    ...(step.words ? { does: { ...step.words } } : {}),
    // The same control in the words the call's own result showed, only when the
    // domain gave no `does` for it: the two name one control (header).
    ...(step.control && !step.words ? { control: step.control } : {}),
    ...(step.resultCode ? { resultCode: step.resultCode } : {}),
    changed: step.effectApplied === undefined ? "unknown" : step.effectApplied ? "yes" : "no",
    disposition: shownDisposition(step),
    inResult: automationStudioFlowDraftStepIsProposed(step),
    // Why Core took the step out (`./reversal.ts`): shown only on such a step,
    // so no other draft pays for it, and gone once the model puts it back.
    ...(step.cancels !== undefined && step.disposition !== "kept" ? { out: takenOutLine(step, all) } : {}),
    // The act the step says it does, under the word the amendment took. Not
    // shown until live run 36, whose model could not see that its listing on
    // step 11 named a1 and spent 24 decisions naming a1 on the Confirm.
    ...(step.acts?.length ? { act: step.acts.join(", ") } : {}),
    // How it answered the last time the draft was run as a Flow. It sits on
    // the step rather than only in the refusal that reported it, because a
    // refusal is one entry a newer refusal supersedes and the draft is the one
    // thing always in front of the model (`./dry-run.ts`). It is deliberately not
    // explained in the instruction above: the word only appears once a replay
    // has happened, and the refusal that put it there explains itself in full.
    // Spending two hundred bytes of every draft entry on a sentence about a
    // check that usually passes would cost the entry steps it has to list.
    // A step that was only checked reads `verified` or `present`, never
    // `replayed` (`./verify-only.ts`): the model must not believe it was done again.
    ...(step.replayed ? { replayed: automationStudioFlowDraftReplayOutcomeWord(step.replayed) } : {}),
    // How many times the test ran a repeated step, once per row, when its replay says.
    ...passesOf(step),
    // What the step says about when it runs, in the step numbers the model
    // reads rather than the ids the draft keeps (`./routing.ts`). It is shown
    // back for the same reason the disposition is: an edit the model made and
    // cannot see is one it makes again. Like `replayed`, it is deliberately not
    // explained in the instruction above -- the grammar is in the amendment
    // schema, which every decision that may amend already carries, and a
    // sentence here would be paid for on every request by every build,
    // including the ones whose Flow is a straight line.
    ...(step.routing ? { runs: routingLine(step.routing, all) } : {}),
    ...(step.settings ? { settings: step.settings } : {})
  };
}

/**
 * What the model is told a step's disposition is.
 *
 * A step that did not work is out of the Flow whatever the model calls it, and
 * listing it as `kept` -- which is what it is, since nobody withdrew it -- read
 * as a step still to be dealt with. Every hard live build of 2026-09-28 spent
 * decisions dropping or "keeping" refused presses, and the draft's own
 * instruction said every listed step had worked. Only what is shown changes:
 * the step keeps its disposition, and no amendment but `rerun` touches it
 * (`./amendment.ts`).
 */
function shownDisposition(step: AutomationStudioFlowDraftStep): string {
  // A written step changed nothing by construction: it was never performed.
  if (step.written !== true && step.checkedCandidate === undefined && step.effectApplied === false && (step.effect === "mutate" || automationStudioFlowDraftStepIsAction(step))) return "did_not_work";
  // Not of the kind a Flow is made of: listed only so its number shows, and
  // no amendment puts it in the Flow (`./amendment.ts`).
  return automationStudioFlowDraftStepIsAction(step) ? step.disposition : "look";
}

/** One routing statement in the words and the numbers an amendment took. */
function routingLine(routing: AutomationStudioFlowDraftStepRouting, all: readonly AutomationStudioFlowDraftStep[]): string {
  const at = (id: string): string => {
    const step = automationStudioFlowDraftStepById(all, id);
    return step ? String(step.position) : "a step no longer in the draft";
  };
  if (routing.kind === "optional") return "optional: the Flow carries on when this fails";
  if (routing.kind === "only_if") return `only if step ${at(routing.check)} succeeded`;
  if (routing.kind === "on_failed") return `on failure, step ${at(routing.to)} runs instead`;
  return `repeats through step ${at(routing.through)}, over step ${at(routing.over)}`;
}

/**
 * Why Core took a step out of the Flow (`./reversal.ts`), in the step numbers
 * the model reads: the step it undid or was undone by, the state the control
 * was in before the first of them -- the state the Flow needs, since the pair
 * changed nothing -- and so where an act about that control belongs.
 *
 * Live run `run-musp8nz1-dbd3905a` added Space Grey off and Space Grey on,
 * both for `a1.colour`, with the colour already chosen when the page arrived:
 * the model had to be told that the act was done before either press, and that
 * pressing the control again undoes it.
 */
function takenOutLine(step: AutomationStudioFlowDraftStep, all: readonly AutomationStudioFlowDraftStep[]): string {
  const partner = automationStudioFlowDraftStepById(all, step.cancels!);
  if (!partner) return "taken out by Core: it pressed back a control a step no longer in the draft pressed, so it changed nothing the Flow needs";
  const first = partner.position < step.position ? partner : step;
  const later = first === step ? partner : step;
  // Two states: before the first press, the control was where the later one put it back.
  const before = later.toggle?.to === "off" ? "not chosen" : "chosen";
  const state = `The control was already ${before} before step ${first.position}, the state the Flow needs: an act about it belongs on the step after which the page first showed it chosen, and pressing it again would undo that state.`;
  const paired = partner.cancels === automationStudioFlowDraftStepId(step);
  if (!paired) return `taken out by Core: it pressed back the control step ${partner.position} pressed, and step ${partner.position} is not in the Flow, so in the Flow it would flip the control the wrong way. ${state} Add it back only if the Flow needs the control the other way.`;
  const why = step === first
    ? `step ${later.position} pressed the same control back, so the two together changed nothing.`
    : `it pressed back the control step ${first.position} pressed, so the two together changed nothing.`;
  return `taken out by Core: ${why} ${state} Add both back only if a step between them needs the control the other way.`;
}

/**
 * `passes`, when the step's last replay carries it: the number of rows the
 * test ran a repeated step for. Read by its shape, because the test that
 * writes it runs a loop as a loop (design t252, D6) and is the one place
 * that knows; a list of passes is counted.
 */
function passesOf(step: AutomationStudioFlowDraftStep): JsonObject {
  const passes = (step.replayed as { passes?: unknown } | undefined)?.passes;
  if (typeof passes === "number" && Number.isSafeInteger(passes) && passes >= 0) return { passes };
  if (Array.isArray(passes)) return { passes: passes.length };
  return {};
}
