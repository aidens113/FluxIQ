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
// **Which acts.** A node that says it lasts: its step declared a class (the build stamps this
// on the node, `engine/automation/defensive/lasting-act.ts`), a trusted floor says it commits,
// or it is marked destructive. Not what the engine also calls lasting because it changes state
// (typing, moving to a page): the record refuses what it holds, and refusing a second visit to
// a page on the next pass of a loop would stop a Flow that means to go there.
//
// **What it does not hold.** A press that declared nothing. A build's own calls disclose one by
// what their answers say (`runtime/answer-first/act-record/gate/act-gate.ts`), but what a node
// answers here does not tell a press from a read, and calling every read in a Flow a press
// would say something false to a judge. The run's own step outcomes say what it ran.

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

type Node = Pick<AutomationStudioFlowNode, "id" | "metadata" | "label">;
/** One step's act about to go, or going. */
export type AutomationStudioAnswerFirstRunActStep = { call: AutomationStudioAttemptActCall; words: { what: string; where: string }; step: string | undefined; lasting: boolean };
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

/** The settling of one run's acts into `record` (header). */
export function automationStudioAnswerFirstRunActSettling(record: AutomationStudioAttemptActRecord): AutomationStudioAnswerFirstRunActSettling {
  let open: Open | undefined;
  let running: Node | undefined;

  const settle = (step: AutomationStudioAnswerFirstRunActStep, answer: AutomationStudioAnswerFirstRunActNodeAnswerRead) => {
    if (!step.lasting) return;
    record.settled(step.call, { effectApplied: answer.applied, uncertain: answer.uncertain, words: step.words, ...(step.step !== undefined ? { step: step.step } : {}) });
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
      const says = floor?.effectClass === "commit" || node?.metadata?.destructive === true;
      const call: AutomationStudioAttemptActCall = {
        actionId, parameters, consequences,
        ...(says && consequences.length === 0 ? { instructedAct: LASTS_WITHOUT_CLASS } : {}),
        ...(row !== undefined ? { row } : {}),
        stage: "run"
      };
      const label = node?.label?.trim();
      return { call, words: { what: label ?? "", where: "" }, step: node ? `node:${node.id}` : undefined, lasting: record.lasting(call) };
    },
    async begin(step) {
      close();
      return step.lasting ? await record.begun(step.call, step.words) : "not_lasting";
    },
    threw(step) {
      open = undefined;
      settle(step, LOST);
    },
    nodeAnswered(step, result, left) {
      if (!step.lasting) return;
      if (!result) {
        record.withdrawn(step.call);
        return;
      }
      if (left > 0) open = { step, left, answer: { applied: false, uncertain: false } };
      else settle(step, automationStudioAnswerFirstRunActNodeAnswer(result));
    },
    async outputSent(send) {
      const held = open;
      if (!held) return await send();
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
        throw error;
      }
      settle(step, automationStudioAnswerFirstRunActNodeAnswer(answer));
      return answer;
    }
  };
}

function declaredOf(node: Node | undefined): string[] {
  const declared: unknown = node?.metadata?.[DECLARED_METADATA];
  return Array.isArray(declared) ? declared.filter((word: JsonValue): word is string => typeof word === "string" && word.length > 0) : [];
}
