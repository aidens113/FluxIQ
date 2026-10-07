// What a model writes when it builds a Flow, before any of it is a plan.
//
// A Flow script is plain lines: `key: value`, one fact per line, nothing
// nested, nothing quoted, nothing escaped. This module holds only the shapes
// the parser produces and the acceptor returns; the grammar itself is in
// `./parse.ts`, and what the model is shown is in `./format.ts`.
import type { AutomationStudioRouteSignatures } from "../../route-state/index.ts";
import type { AutomationStudioFlowBootstrapIssue, AutomationStudioFlowBootstrapPlan } from "../plan/index.ts";

/** One `key: value` line inside a step, with its value already joined. */
export type AutomationStudioFlowScriptEntry = {
  /** The key exactly as written, dots included: `extractList.fields.name`. */
  key: string;
  /** The value's lines, in order. One line unless the model continued it. */
  lines: string[];
  /** Where in the script, counting from 1, for a refusal that names a line. */
  line: number;
};

/** A branch from one of a step's output ports to a labelled step. */
export type AutomationStudioFlowScriptBranch = {
  /** The port as written: an id or a label the node's catalog entry shows. */
  port: string;
  /** The label of the step this port goes to. */
  target: string;
  /**
   * Which of the target's input ports this edge arrives at, when it matters.
   *
   * A model never writes this: it says where a path goes, and which way in the
   * step takes is derived -- the first one still free. It matters only for a
   * node whose input ports mean different things, which is how a repeating span
   * is wired (`./assemble-draft.ts`): the rows go into For Each's `items` and
   * the path into its control input, and taking whichever was free first would
   * wire the rows as the path.
   */
  targetPort?: string;
  line: number;
};

export type AutomationStudioFlowScriptStep = {
  /** The label the model invented, lower-cased; absent when it wrote none. */
  label?: string;
  /** What the step does, in the model's words. May name the node. */
  description: string;
  /** The `node:` line's value, when the model wrote one. */
  node?: string;
  /** The block this step runs instead of doing anything itself. */
  runsBlock?: string;
  entries: AutomationStudioFlowScriptEntry[];
  branches: AutomationStudioFlowScriptBranch[];
  /**
   * Every edge out of this step is written above; nothing falls through.
   *
   * Order carries the meaning in a script a model wrote, and it must keep
   * doing so. A derived step is different: it is written by the code that
   * decided the shape (`./assemble-draft.ts`), which knows exactly where each
   * of its ports goes -- a For Each's `body` and `done`, a step whose success
   * and failure part company. Letting such a step also fall through to whatever
   * was written next would add an edge nobody meant, off whichever port
   * happened to be left over.
   */
  routed?: true;
  /**
   * The draft step this step was written from, by its id. Never written by a
   * model: set only when a draft is written down (`./draft-routing.ts`), so
   * the plan node it becomes can be traced back to the step that made it
   * rather than guessed from where it landed after routing added its joins.
   */
  draftStepId?: string;
  /**
   * The route signatures the build recorded for the draft step this was
   * written from: the page it started on and the page it left
   * (`../../route-state/build-routing.ts`). Never written by a model, and set
   * only on a step a draft step became; a join or a loop routing adds has none.
   */
  routeSignatures?: AutomationStudioRouteSignatures;
  /**
   * What the Flow node this step becomes is named: the draft step's described
   * name, in the domain's words (`does.target`, R3-U-12), which a run's step
   * card shows. Never written by a model, and set only on a step a draft step
   * became; a join or a loop routing adds has none.
   */
  nodeLabel?: string;
  /**
   * The span this step starts and what repeats it, from its `repeat over:`,
   * `repeat through:`, `repeat while:` and `repeat most:` lines. The same
   * statement a draft step's `repeat` routing makes, and lowered into the same
   * steps (`./draft-routing.ts`), so a written loop and a drafted one are one
   * graph shape.
   */
  repeat?: AutomationStudioFlowScriptRepeat;
  line: number;
};

/**
 * What a step's `repeat ...:` lines said, as written: each label already
 * reduced the way a branch target is (`./keys.ts`), `most` as its text. Which
 * combinations mean something is the router's question, not the parser's.
 */
export type AutomationStudioFlowScriptRepeat = {
  /** The listing whose rows the span walks, once each. */
  over?: string;
  /** The last step of the span; absent, the span is this step alone. */
  through?: string;
  /** The last step of a span that runs again while that step succeeds. */
  while?: string;
  /** The most passes a `while` span takes. */
  most?: string;
  /** The first `repeat` line, for a refusal that names one. */
  line: number;
};

/** A `when:` or `unless:` line: when the router runs the block it sits in. */
export type AutomationStudioFlowScriptCondition = {
  /** The condition as written, after the colon. */
  text: string;
  /** `unless:` -- the block runs when the condition does not hold. */
  negate?: true;
  line: number;
};

/** A block of steps: the main sequence, or a named subflow. */
export type AutomationStudioFlowScriptBlock = {
  /** The label a `subflow <label>:` line gave; absent for the main block. */
  label?: string;
  name: string;
  role?: AutomationStudioFlowBootstrapPlan["subflows"][number]["role"];
  /** When the router runs this block; every line must hold. Absent, nothing routes to it by condition. */
  when?: AutomationStudioFlowScriptCondition[];
  steps: AutomationStudioFlowScriptStep[];
  line: number;
};

export type AutomationStudioFlowScript = {
  /** The `flow:` line, when the model wrote one. */
  summary?: string;
  /** The main sequence first, then each named block in the order written. */
  blocks: AutomationStudioFlowScriptBlock[];
};

/**
 * A result the acceptor could read, or the issues that refused it.
 *
 * `script` is what the reply was read from, when it arrived as a Flow script,
 * exactly as the model wrote it. It is carried on both answers because the
 * checks that refuse a plan run after it was accepted, and each of them has to
 * be able to hand the model back its own draft to correct. Every decision is a
 * fresh request with no conversation history, so without this the model is
 * asked to try again with its previous answer absent from the question, and the
 * only thing it can do is write a new one from memory -- which is how a live
 * build "completed again with those steps deleted and the wrong answer in their
 * place". It is the model's own writing and never page content, so handing it
 * back tells the model nothing its own tools had not already told it.
 *
 * A refusal may carry `refusedPlan`: the plan the script got as far as, so a
 * refusal's feedback can read each node's definition out of it and answer with
 * the parameters that node does declare. Nothing builds, validates or persists
 * from it -- it holds at least one refused node by construction -- and it is
 * deliberately not called `plan`, so no caller reaches it by widening a check.
 */
export type AutomationStudioFlowBootstrapAcceptance =
  | { ok: true; summary: string; plan: AutomationStudioFlowBootstrapPlan; issues: AutomationStudioFlowBootstrapIssue[]; script?: string }
  | { ok: false; issues: AutomationStudioFlowBootstrapIssue[]; refusedPlan?: AutomationStudioFlowBootstrapPlan; script?: string };
