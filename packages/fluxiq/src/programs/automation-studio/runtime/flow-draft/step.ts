// One step of a draft: an action the loop took, as it happened.
//
// The draft exists because authoring used to be a separate act from exploring.
// A loop explored, and then, at the end, the model wrote down what it
// remembered doing -- and what it remembered was bounded by what was still in
// front of it. The window keeps the newest result of each tool first, so a
// build that pressed five controls had all five results under one tool id and
// only the last was certain to be visible when it wrote the result. It did not
// forget its earlier presses; it could no longer see them, and a live build
// produced a result with every one of them missing.
//
// So a step is appended the moment it happens, and the loop carries the list to
// the end. What is appended is what the loop observed -- which action, the
// argument it was given, whether it changed anything -- rather than what the
// model later says it did. Appended is not added: a step the model runs is
// evidence of what works, and it is the model that decides which of them make
// the Flow (`taken`, below).
//
// **A step is opaque.** `actionId` is a name Core does not interpret and
// `input` is the argument it was given, carried so a kept step can be written
// down or run again. Nothing here knows what kind of thing is being automated,
// which is the property that lets one draft serve every domain.
//
// The shape is deliberately the one `runtime/exploration-reduction/` already
// reads -- an action, its argument, whether it looked or changed something,
// whether it worked, and a state digest either side -- so a draft reduces
// through the reducer that is already there rather than a second one written
// beside it.

import type { JsonObject } from "../../../../core/index.ts";
import type { AutomationStudioFlowDraftScheduledCandidate } from "./scheduled-candidate/index.ts";
import type { AutomationStudioFlowDraftReplayOutcome, AutomationStudioFlowDraftStepReplay } from "./dry-run.ts";
import type { AutomationStudioFlowDraftStepRouting } from "./routing.ts";

/**
 * Whether a step only read the state or changed it.
 *
 * The same two words the evidence loop's tool table and the exploration
 * reducer use, deliberately: a second vocabulary for the same distinction is
 * how the two come to disagree about one action.
 */
export type AutomationStudioFlowDraftStepEffect = "observe" | "mutate";

/**
 * What the model has since said about a step it took.
 *
 * `taken` is where every step the model runs starts when the model authors the
 * draft (user, 2026-09-30: "IT SHOULD NOT JUST BLINDLY ADD EACH STEP THAT IT
 * TOOK ONE BY ONE IN ORDER"): the step ran and is evidence, and it is not in
 * the Flow until the model adds it -- `add` on the call itself, or an `add`
 * amendment naming it (`./amendment.ts`). `kept` is a step the model put in the
 * Flow; it is also where every step started under the older transcript rule,
 * which a loop can still be run under to replay a build recorded before
 * (`../llm/loop-configuration.ts`, `draftAuthoring`). The other two are the
 * model's own withdrawals: `dropped` is "this should not be in the result at
 * all", and `exploratory` is "I did this to look around". They are held apart
 * because they are different statements about one step, and a reader of the
 * draft can tell a step that was a mistake from one that was a detour, and
 * both from one the model has simply not added.
 */
export type AutomationStudioFlowDraftStepDisposition = "kept" | "taken" | "dropped" | "exploratory";

/**
 * What a step's call names, in the bound domain's own words: the control its
 * argument names by a token, and the words it types or looks for -- the same
 * answer the chat shows (`../llm/loop-configuration.ts`, `describeCall`).
 */
export type AutomationStudioFlowDraftStepWords = { target?: string; text?: string };

/**
 * The host's word that a step flipped whether the control it acted on is
 * chosen: `key` names the control, as an opaque code the host keeps for one
 * control for the whole build, and `to` says which way it went
 * (`./reversal.ts`). Core compares keys for equality and reads nothing else.
 */
export type AutomationStudioFlowDraftStepToggle = { key: string; to: "on" | "off" };

export type AutomationStudioFlowDraftStep = {
  /** Where it is in the draft, counting from 1: what an amendment names. */
  position: number;
  /**
   * The step's own name, given when it was appended and never changed after.
   *
   * A position is what the model reads and writes, and it is renumbered the
   * moment a step is moved or withdrawn -- so anything the draft has to
   * remember *about* a step across such an edit is remembered under this
   * instead (`./routing.ts`). Absent on a step nothing appended, which is a
   * step nothing will renumber either.
   */
  id?: string;
  /** The loop iteration that decided it. */
  iteration: number;
  /** The call that ran it; absent when the loop answered the request itself. */
  callId?: string;
  /** What was done. An opaque name; Core never interprets it. */
  actionId: string;
  /**
   * The tool the call went through, when that is not `actionId` itself.
   *
   * One tool may run any number of named things -- the library of nodes a
   * build may run is one tool whose argument names the node -- and then the
   * draft's `actionId` is the node and this is the tool that ran it. An
   * amendment that asks for a step to be run again needs both: the tool to
   * call, and the name to record against what comes back.
   */
  toolId?: string;
  /**
   * The argument it was given, as the caller reported it, and the only one the
   * model is ever shown back.
   */
  input: JsonObject;
  /**
   * What the step actually ran with, when that is not what it was written with.
   *
   * The two differ whenever an argument names something by a token the caller
   * has to make real -- a handle standing for a control the model was shown --
   * and the difference matters twice. What is written down is the *resolved*
   * form, because a token is a name for something on a page as it was, and a
   * page that re-renders stops having it: a live build ran four nodes
   * successfully and had its Flow refused because the handles no longer
   * resolved. What the model is *shown* is the written form, because the
   * resolved form is the caller's own medium -- selectors, in the web's case --
   * and a domain declares keys that may never reach a model.
   *
   * Core reads neither. Both are opaque JSON carried for whoever writes the
   * step down.
   */
  ranWith?: JsonObject;
  /** Unperformed unchanged saved configuration; private correspondence is required to schedule it. */
  scheduledCandidate?: AutomationStudioFlowDraftScheduledCandidate;
  /**
   * The words of the control the step acted on, as the call's own result showed
   * them, when it acted on one (`./control-words.ts`).
   *
   * Shown beside `input` because a token names a control only while its page
   * stands: live run `run-muqiho5c-e830ce01` added a press of "Not now" as its
   * add-to-cart act, from a draft that showed the step as a handle alone. Page
   * text, bounded and screened; never a parameter of the Flow, which is written
   * from `input`, `ranWith` and `settings` alone.
   */
  control?: string;
  /**
   * The host says this step answered something that stood in front of the
   * page -- a dialog, a consent wall, a covering popup -- and was gone after
   * it, as the caller stated it on its own call.
   *
   * Such a layer is there on one visit and not the next: a site that remembers
   * the answer never shows it again. So a step that says it, does none of the
   * person's acts and says nothing else about when it runs is optional in the
   * Flow (`./sometimes-present.ts`), and playback skips it when it is absent.
   * The stored `routing` is left as it was; only the routing the Flow is
   * written from changes.
   */
  interruption?: true;
  /**
   * The host says this step flipped whether the control it acted on is chosen,
   * as the caller stated it on its own call (`./reversal.ts`).
   *
   * A press that a later press of the same control undoes is a pair that
   * changed nothing, and whole-page digests cannot show it: live run
   * `run-murwd8le-79e735a8` shipped Space Grey off and on again, kept and
   * brought in as an opener of Add to cart, with steps between them that
   * changed the page. Only the host can name the control, so it does.
   */
  toggle?: AutomationStudioFlowDraftStepToggle;
  /**
   * The id of the step this one undid or was undone by, set when Core took it
   * out of the Flow for that (`./reversal.ts`): both halves of a pair carry
   * each other's id, a lone reversal carries the id of the step it put back.
   * Kept when the model puts the step back, and then the model's decision
   * stands: Core never takes out a step that carries it again. The draft entry
   * says why the step is out (`./entry.ts`, `out`).
   */
  cancels?: string;
  /**
   * What the call names, in the domain's words, kept when the step was
   * appended: the draft line shows it as `does` (`./entry.ts`).
   *
   * `input` names a control by a token -- `{"target":{"handle":"t1091"}}` --
   * and a token means something only on the page it was shown on, so a draft of
   * ten presses read as ten lines the model could not tell apart. Live run
   * `run-muqiojz4-04a7a8fc` named its step 10, a "×" closing a chat overlay, as
   * the act "add ... to my cart", and the Flow failed its test on that ×.
   * Absent when the caller has no words for the call, or its answer could not
   * be read.
   */
  words?: AutomationStudioFlowDraftStepWords;
  effect: AutomationStudioFlowDraftStepEffect;
  /** Whether a changing action changed anything, as the caller reported it. */
  effectApplied?: boolean;
  /** The caller's own code for the result. Core carries it and never reads it. */
  resultCode?: string;
  /** A digest of the whole state before the step, when one was taken. */
  stateBefore?: string;
  /** The same digest taken after it. */
  stateAfter?: string;
  disposition: AutomationStudioFlowDraftStepDisposition;
  /**
   * Whether a successful call of this kind is a step the result should
   * contain, as the caller reported it.
   *
   * Absent, it is read from the effect, which is the rule that held while the
   * only things a loop could do were look and change: an observation is how
   * the loop looked and a change is what it did. That rule stops being true the
   * moment the things a loop runs are the *nodes the result is made of*. A
   * list extraction changes nothing on the page and is the whole point of a
   * scraping Flow; a snapshot changes nothing and belongs in no Flow at all.
   * Neither can be told from the other by its effect, so the caller that ran
   * it says which it was, and says `false` for one that failed -- a step that
   * did not work is not a step the result may contain.
   */
  proposes?: boolean;
  /** Settings the model amended onto the step. Carried opaquely. */
  settings?: JsonObject;
  /**
   * What running this step again needs, when the caller can run it again.
   *
   * Opaque, like `input` and `ranWith`: how to put the target back the way this
   * step found it, and what it produced, so the caller can say whether a replay
   * reproduced it. Core carries both and reads neither (`./dry-run.ts`). A
   * draft whose proposed steps all carry it is a draft that must replay clean
   * before it may be proposed; one that does not is simply not replayed.
   */
  replay?: AutomationStudioFlowDraftStepReplay;
  /**
   * How this step answered the last time the draft was replayed.
   *
   * Written by the loop, not by the caller, and kept on the step so the record
   * of what the Flow did when it was run as a Flow travels with the step it is
   * about -- the draft the model is shown reads it, and so does anyone reading
   * the steps afterwards.
   *
   * It is about the step as the test ran it: after the steps before it then,
   * with the argument it had then. So a move clears it on every step from
   * where the move begins (`./amendment.ts`), and a checked rerun that gives
   * the step a new argument clears it (`../llm/node-tools/rerun-check.ts`):
   * absent, the step has not been tested as it now stands (live run
   * `run-musq0b1m-0472cfa0`, Cause 6).
   */
  replayed?: AutomationStudioFlowDraftReplayOutcome;
  /**
   * What this step says about when it runs, when it is not simply the next
   * thing that happens (`./routing.ts`).
   *
   * Absent, the step is unconditional, which is every step until the model says
   * otherwise. Present, it names other steps of this draft by their ids and the
   * assembler derives the nodes, ports and edges that make it true -- the model
   * states the relation and never the graph.
   */
  routing?: AutomationStudioFlowDraftStepRouting;
  /**
   * The instructed acts (`a1`, `a2` ...) the model says this step does, written
   * when it added the step or later. Core's ids for acts it showed the model
   * beside the draft (`../flow-bootstrap/instructed-acts/checklist.ts`); the
   * completion check reads them as the model's claims, so an authored step that
   * says which act it does needs no claim written again at the end.
   */
  acts?: string[];
  /**
   * The id of the step whose place in the Flow this one took when it was rerun
   * (`../llm/evidence-loop/rerun-replacement.ts`), or of the step that one stood
   * for: the start of the chain. A step carried from an earlier Flow (`f<n>`,
   * `../llm/node-tools/draft-from-flow.ts`) must run in the build before the
   * Flow can be tested whole (t244, user 2026-10-02), and the rerun that runs it
   * is a new step with an id of its own; this is how the written Flow still
   * knows it is that node, and keeps its id.
   */
  standsFor?: string;
  /**
   * What state routing recorded on the Flow node a carried step stands for
   * (`metadata.routeSignatures`: the pages it ran between, and what it did,
   * as the build signed them), carried unread from the re-seed to whatever
   * writes the Flow, and onto a rerun that took its place. Read only where a
   * step's own run recorded none, so a re-authored Flow keeps state routing for
   * a node whose fresh signatures could not be taken.
   */
  routeSignatures?: JsonObject;
  /**
   * The step was written, not run (`core.run_node` with `write: true`, design
   * t252): the domain checked its node and parameters, froze what it names and
   * performed nothing. Set only when the domain answered that it wrote it, so a
   * domain that ignored the request and acted leaves an ordinary step that ran,
   * never a false "written". A written step is proposable whatever
   * `effectApplied` says -- it changed nothing by construction -- and carries
   * `ranWith` and `replay`, so the test runs it like any step.
   */
  written?: true;
  /** A replacement configuration checked by the host, never performed by this check. */
  checkedCandidate?: { callId: string; code: string };
  /**
   * The original performed configuration, retained privately when a lasting
   * step is replaced by a checked candidate. Its proof belongs to that input,
   * never to the candidate. The lasting guard survives further retargets.
   */
  priorExecution?: Omit<AutomationStudioFlowDraftStep, "priorExecution" | "checkedCandidate"> & { lasting: true };
  /**
   * The argument the step first ran with, kept when `bind` lifted a value of it
   * into a binding (`./amendment.ts`): the evidence that the step worked with
   * that value. Never set on a written step, which never ran with one, and
   * never replaced by a later `bind`. Carried, never run.
   */
  instance?: JsonObject;
};

/**
 * Whether a step is one the draft proposes.
 *
 * Two conditions. The step has to be one of the kind a result is made of, and
 * to have worked: the caller says so on `proposes`, and where it said nothing
 * the older rule stands -- it changed something, and the change applied. And
 * the model has to have left it alone, because `dropped` and `exploratory` are
 * exactly the two ways it says otherwise.
 */
export function automationStudioFlowDraftStepIsProposed(step: AutomationStudioFlowDraftStep): boolean {
  return step.disposition === "kept" && automationStudioFlowDraftStepIsProposable(step);
}

/**
 * Whether a step is one the result could contain, before the model's own
 * amendments are consulted.
 *
 * A step the model withdrew is still in the draft it is shown, with
 * `inResult: false` beside it rather than silently gone. A step that only
 * looked, or that failed, is never one of these: neither is a thing the model
 * could put in the Flow by changing its mind about it. A written step did not
 * fail: it was never performed (`written`).
 */
export function automationStudioFlowDraftStepIsProposable(step: AutomationStudioFlowDraftStep): boolean {
  // A written step did nothing by construction, so "changed nothing" is not a failure of it.
  return automationStudioFlowDraftStepIsAction(step) && (step.written === true || step.checkedCandidate !== undefined || step.effectApplied !== false);
}

/**
 * Whether a step is one of the kind a result is made of, whether or not this
 * attempt worked.
 *
 * This is what the draft lists as its steps, because the receipt is what makes
 * the draft checkable: a reader can see that the loop pressed six controls, that
 * one of them failed and one was withdrawn, and that the other four are what the
 * result contains. A list with the other two silently absent is a claim nobody
 * can audit. A step that only looked is not of that kind at all: it is listed
 * as a look only so its number shows (`./entry.ts`), and no amendment puts it in
 * the Flow (`./amendment.ts`).
 */
export function automationStudioFlowDraftStepIsAction(step: AutomationStudioFlowDraftStep): boolean {
  return step.proposes ?? step.effect === "mutate";
}
