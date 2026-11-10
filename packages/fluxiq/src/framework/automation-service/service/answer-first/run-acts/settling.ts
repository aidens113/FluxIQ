// A real run's lasting acts, on the attempt's record as they happen (t870, plan D6;
// `./run-gate.ts` with `settle: true`).
//
// **One act, two doors.** A web step's node answers first and its press is sent after, as the
// output the answer asks for (`engine/automation/node-execution/attempt.ts`). So the act goes
// on the record at the node's door, before the node is called, and is settled by what the last
// of its outputs answered. A node with no output to send is settled by its own answer. A node
// that said it failed, and whose outputs were never sent, can leave an act open: the next step
// closes it as may have landed, since nothing more will ever be said of it.
//
// **Which acts.** A node that says it lasts, by what Core holds of the step: it declared a class
// (the build stamps this on the node, `engine/automation/defensive/lasting-act.ts`), a trusted
// floor names one, its draft step claims one of the lasting acts the person asked for
// (`../flow-run/act-claims.ts`), or it is marked destructive. Not what the engine also calls
// lasting because it changes state (typing, moving to a page): the record refuses what it holds,
// and refusing a second visit to a page on the next pass of a loop would stop a Flow that means
// to go there.
//
// **A plain press (t869).** A floor saying a press commits names no consequence: it says a page
// decides what a press does, so the engine must not repeat one whose answer was lost
// (`engine/automation/defensive/assess.ts`). It does not make every press lasting. Read so, the
// record refused a Flow's second Apply on a page that swallowed the first, and a Next page on the
// next pass, and the run stopped at the step after. So a press that declares nothing and claims
// no act is sent each time the Flow says, and nothing refuses it, and it is told as a build's own
// is (`runtime/answer-first/act-record/record.ts`, "The disclosed limit"):
//
//   answered that it acted       may have landed, marked undeclared: shown to the next round and
//                                left out of the result's acts and of every refusal.
//   answered nothing certain     may have landed and held to a look, as the target's own word is
//                                below. It may be the press that landed, and the engine stops on it.
//   already in its state, or     nothing.
//   nothing acted
//
// So a toggle whose step said nothing of what it does is pressed as often as its Flow says within one
// run, and its answer's own word that it flipped goes with it (`changedState`), which is what holds it
// to a look in a later attempt (`runtime/answer-first/act-record/seed.ts`). A press that declares or
// claims is never sent twice, whatever else it matches.
//
// **What it does not hold.** A step with no floor that declared nothing: what a node answers there
// does not tell a press from a read, and calling every read in a Flow a press would say something
// false to a judge. The run's own step outcomes say what it ran.
//
// **A press that met a check only a person can clear (run-mwa19obz-abd5d558).** The page answered the press
// with a robot check, the run asked the person, and it goes on down the step's own success route once they
// clear it (`engine/automation/person-needed.ts`): the press reached the page, and the engine carries on as
// though it had answered that it acted. So it is told as one that did, never held in doubt. Held, it read as
// a lasting act that may have landed, and every later pass of a loop over it was refused as already done: the
// saved Flow's Next page, after the person cleared the check its second press met, was skipped on each pass
// after, the loop stood still on one page and the run ended `repeat.no_progress`, and the next round's run of
// the Flow was refused its sort until a look, so its read read the list unsorted. One that says nothing was
// sent (`effect: "unacted"`) is nothing on the record, as any such answer is.
//
// **Except where the target itself says an act was made.** A failure stating `effect: "ambiguous"`
// is the producer saying it acted and only the answer is missing, and its statement outranks what the
// step declared, since a model under-declares (`engine/automation/defensive/lasting-act.ts`). The
// engine then refuses to repeat it and stops, and without this the record would know nothing of it, so
// a repair's by-hand press would go straight through: the act done twice. It goes on the record as
// may have landed, when the answer comes. It cannot be begun first: nothing says so until then.

import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type { AutomationNodeExecutionResult, AutomationStudioResolvedActionEffect } from "../../../../../components/automation/index.ts";
import type { AutomationStudioFlowNode } from "../../../../../flows/executable/graph/index.ts";
import type { AutomationStudioAttemptActBegun, AutomationStudioAttemptActCall, AutomationStudioAttemptActRecord } from "../../../../../runtime/answer-first/act-record/index.ts";
import { automationStudioAnswerFirstRunActNodeAnswer, type AutomationStudioAnswerFirstRunActNodeAnswerRead } from "./node-answer.ts";

/** Where a Flow node keeps its step's declared consequences (`engine/automation/defensive/contracts.ts`, restated with `./tests/settling.test.ts` holding the two together). */
const DECLARED_METADATA = "declaredConsequences";
/** A lasting call that names no class: it lasts, and what kind of act it is nobody said. */
const LASTS_WITHOUT_CLASS = "flow_step";
const LOST: AutomationStudioAnswerFirstRunActNodeAnswerRead = { applied: false, uncertain: true };
/** The failure category a domain answers a check only a person can clear with (`engine/automation/person-needed.ts`). */
const PERSON_NEEDED_CATEGORY = "user_intervention_required";

type Node = Pick<AutomationStudioFlowNode, "id" | "metadata" | "label">;
/** One step's act about to go, or going. */
export type AutomationStudioAnswerFirstRunActStep = {
  call: AutomationStudioAttemptActCall;
  words: { what: string; where: string };
  step: string | undefined;
  lasting: boolean;
  /** A press a floor says commits, that declares and claims nothing (header). */
  plainPress: boolean;
};
type Open = { step: AutomationStudioAnswerFirstRunActStep; left: number; answer: AutomationStudioAnswerFirstRunActNodeAnswerRead };
type Sent = AutomationNodeExecutionResult | undefined;

export type AutomationStudioAnswerFirstRunActSettling = {
  /** A node the engine is about to run: the only place a Core node's declaration can be read, since its output comes with no node. */
  sawNode(node: Node): void;
  /** The step as an act, under `actionId`, by the node the engine last said it is running where no node is given. */
  stepOf(input: { node?: Node | undefined; actionId: string; parameters: JsonObject; row?: JsonObject | undefined; floor?: AutomationStudioResolvedActionEffect | undefined }): AutomationStudioAnswerFirstRunActStep;
  /** On the record before it is sent. Closes an act an earlier step left open first. */
  begin(step: AutomationStudioAnswerFirstRunActStep): Promise<AutomationStudioAttemptActBegun>;
  threw(step: AutomationStudioAnswerFirstRunActStep): void;
  /** A node answered, with `left` outputs still to send. None, and it settles; no answer at all, and it never ran, so it comes off the record. */
  nodeAnswered(step: AutomationStudioAnswerFirstRunActStep, result: AutomationNodeExecutionResult | undefined, left: number): void;
  /** One of the outputs of the node's act: settled by the last, or by the first that failed, after which the engine sends no more. */
  outputSent(send: () => Promise<Sent>): Promise<Sent>;
  /** A Core node's own output, which is its whole act. */
  coreSent(step: AutomationStudioAnswerFirstRunActStep, send: () => Promise<Sent>): Promise<Sent>;
};

/** The settling of one run's acts into `record` (header). `claimsAct` says a node's draft step claims a lasting act the person asked for. */
export function automationStudioAnswerFirstRunActSettling(record: AutomationStudioAttemptActRecord, options: { claimsAct?: ((node: Node) => boolean) | undefined } = {}): AutomationStudioAnswerFirstRunActSettling {
  let open: Open | undefined;
  let running: Node | undefined;
  /** A step that declared nothing, whose outputs are still to send. */
  let quiet: AutomationStudioAnswerFirstRunActStep | undefined;

  const settle = (step: AutomationStudioAnswerFirstRunActStep, answer: AutomationStudioAnswerFirstRunActNodeAnswerRead) => {
    if (!step.lasting) return;
    record.settled(step.call, { effectApplied: answer.applied, uncertain: answer.uncertain, words: step.words, ...(step.step !== undefined ? { step: step.step } : {}) });
  };
  const named = (step: AutomationStudioAnswerFirstRunActStep) => step.step !== undefined ? { step: step.step } : {};
  /** A step whose answer leaves in doubt what nothing declared: held to a look, as nobody can say it did not act. */
  const heldInDoubt = (step: AutomationStudioAnswerFirstRunActStep) => {
    record.settled({ ...step.call, instructedAct: LASTS_WITHOUT_CLASS }, { effectApplied: false, uncertain: true, words: step.words, ...named(step) });
  };
  /** What a step that does not last says of itself (header): the target's own word that it acted, and for a plain press its answer. */
  const heldByTarget = (step: AutomationStudioAnswerFirstRunActStep, result: Sent) => {
    if (metPersonCheck(result)) {
      if (step.plainPress && result?.failure?.effect !== "unacted") record.settled(step.call, { effectApplied: true, words: step.words, ...named(step) });
      return;
    }
    if (result?.status === "failed" && result.failure?.effect === "ambiguous") return heldInDoubt(step);
    if (!step.plainPress) return;
    const said = automationStudioAnswerFirstRunActNodeAnswer(result);
    if (said.uncertain) heldInDoubt(step);
    else if (said.applied) record.settled(step.call, { effectApplied: true, words: step.words, ...named(step), ...(said.flipped ? { changedState: true } : {}) });
  };
  const close = (answer: AutomationStudioAnswerFirstRunActNodeAnswerRead = LOST) => {
    if (open) settle(open.step, answer);
    open = undefined;
  };

  return {
    sawNode(node) {
      // The engine asks again about the node's output with a bare node of the same id: it says nothing new.
      if (running?.id === node.id && node.metadata === undefined) return;
      running = node;
    },
    stepOf({ node = running, actionId, parameters, row, floor }) {
      const consequences = [...declaredOf(node), ...(floor?.permissionConsequences ?? [])];
      const says = node?.metadata?.destructive === true || (node !== undefined && options.claimsAct?.(node) === true);
      const call: AutomationStudioAttemptActCall = {
        actionId, parameters, consequences,
        ...(says && consequences.length === 0 ? { instructedAct: LASTS_WITHOUT_CLASS } : {}),
        ...(row !== undefined ? { row } : {}),
        stage: "run"
      };
      const label = node?.label?.trim();
      const lasting = record.lasting(call);
      return { call, words: { what: label ?? "", where: "" }, step: node ? `node:${node.id}` : undefined, lasting, plainPress: !lasting && floor?.effectClass === "commit" };
    },
    async begin(step) {
      close();
      return step.lasting ? await record.begun(step.call, step.words) : "not_lasting";
    },
    threw(step) {
      open = undefined;
      settle(step, LOST);
      if (step.plainPress) heldInDoubt(step);
    },
    nodeAnswered(step, result, left) {
      if (!step.lasting) {
        quiet = left > 0 ? step : undefined;
        // A node with outputs to send has acted on nothing yet: what they answer says, unless it says itself that it failed.
        if (result && (left === 0 || result.status === "failed")) heldByTarget(step, result);
        return;
      }
      if (!result) {
        record.withdrawn(step.call);
        return;
      }
      if (left > 0) open = { step, left, answer: { applied: false, uncertain: false } };
      else settle(step, automationStudioAnswerFirstRunActNodeAnswer(result));
    },
    async outputSent(send) {
      const held = open;
      if (!held) {
        let answer: Sent;
        try {
          answer = await send();
        } catch (error) {
          if (quiet?.plainPress) heldInDoubt(quiet);
          throw error;
        }
        if (quiet) heldByTarget(quiet, answer);
        return answer;
      }
      let answer: Sent;
      try {
        answer = await send();
      } catch (error) {
        close();
        throw error;
      }
      const said = automationStudioAnswerFirstRunActNodeAnswer(answer);
      held.answer = { applied: held.answer.applied || said.applied, uncertain: held.answer.uncertain || said.uncertain };
      held.left -= 1;
      if (held.left <= 0 || answer?.status === "failed") close(held.answer);
      return answer;
    },
    async coreSent(step, send) {
      let answer: Sent;
      try {
        answer = await send();
      } catch (error) {
        settle(step, LOST);
        if (step.plainPress) heldInDoubt(step);
        throw error;
      }
      if (step.lasting) settle(step, automationStudioAnswerFirstRunActNodeAnswer(answer));
      else heldByTarget(step, answer);
      return answer;
    }
  };
}

/** A step whose answer is a check only a person can clear, which the engine puts to them and goes on from (header). */
function metPersonCheck(result: Sent): boolean {
  return result?.status === "failed" && result.failure?.category === PERSON_NEEDED_CATEGORY;
}

function declaredOf(node: Node | undefined): string[] {
  const declared: unknown = node?.metadata?.[DECLARED_METADATA];
  return Array.isArray(declared) ? declared.filter((word: JsonValue): word is string => typeof word === "string" && word.length > 0) : [];
}
