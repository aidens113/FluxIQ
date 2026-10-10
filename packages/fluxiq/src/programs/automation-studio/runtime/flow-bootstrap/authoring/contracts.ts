// What a model writes when it builds a Flow, before any of it is a plan.
//
// A Flow script is plain lines: `key: value`, one fact per line, nothing
// nested, nothing quoted, nothing escaped. This module holds only the shapes
// the parser produces and the acceptor returns; the grammar itself is in
// `./parse.ts`, and what the model is shown is in `./format.ts`.
import type { JsonObject } from "../../../../../core/index.ts";
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
  /**
   * Core wrote this branch: an optional step's way past itself, to the join
   * its guarded group meets at (`../script-statements/guarded-steps.ts`).
   * Never written by a model. A span refuses a branch a model wrote inside it,
   * because the loop's own edges would replace it; this one stays inside the
   * span by construction, so the span takes it.
   */
  guard?: true;
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
  /**
   * The step's `call: <part>` line: the step runs the part the label names and
   * waits for it, passing the part's inputs from its other lines
   * (`../script-statements/called-parts.ts`). A `step: run subflow <label>`
   * naming a part says the same.
   */
  calls?: AutomationStudioFlowScriptLabelLine;
  /**
   * The step's `checkpoint:` line, as written: a handler's `then: go to` may
   * bring the run back to this step (`../script-statements/entry-points.ts`).
   */
  checkpoint?: AutomationStudioFlowScriptOptional;
  /**
   * Parameters Core set on a step it derived -- a handler's registration and
   * the end of its body (`../script-statements/handler-blocks.ts`). Never
   * written by a model; read before the written lines, which a derived step
   * has none of.
   */
  derivedParameters?: JsonObject;
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
   * card shows. Never written by a model as such: set on a step a draft step
   * became, and on a handler's registration and end from the words written
   * for it (`../script-statements/handler-blocks.ts`). A step the model wrote
   * without one is named by its description (`./assemble.ts`); a join or a
   * loop routing adds has none.
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
  /**
   * The step's `optional:` line, as written: the step is only sometimes needed
   * -- a consent banner or a popup that may not be showing -- so the run goes
   * on past it when it cannot be done. Assembled into the optional shape a
   * drafted `optional` step becomes (`./draft-routing.ts`), which the runtime
   * already skips when the target is absent
   * (`../../executor/step-skip/absent-step.ts`). Whether the value says yes,
   * and whether the step may be optional where it stands, is the assembler's
   * question, not the parser's.
   */
  optional?: AutomationStudioFlowScriptOptional;
  /**
   * The step's `only after: <label>` line, as written: the step runs only on
   * the passes where the optional step it names was done, and is gone past
   * with it otherwise (t378). It stands directly after that optional step, or
   * after another step that says the same, in the same block and span
   * (`../script-statements/guarded-steps.ts`).
   */
  onlyAfter?: AutomationStudioFlowScriptOnlyAfter;
  /**
   * The least time, in whole milliseconds, between two starts of the node this
   * step becomes in one run: a span's `repeat pace:`, set on the span's first
   * step (`../script-statements/repeat-pace.ts`). Never written by a model as
   * such; it becomes the plan node's `paceMs`.
   */
  paceMs?: number;
  /**
   * For a step Core derived rather than the model wrote (`line` 0) -- the join
   * after an optional step, the Merges, For Each and Repeat a loop is wired
   * with -- the line of the written step whose statement made it. Never
   * written by a model. A refusal about a derived node is said about this
   * step (`./script-locator.ts`): the model can find and fix the step it wrote,
   * and never a node it did not.
   */
  cause?: number;
  line: number;
};

/** A step's `optional:` line: its value as written, and where it was written. */
export type AutomationStudioFlowScriptOptional = {
  text: string;
  line: number;
};

/** A step's `only after:` line: the label it names, reduced as a branch target is (`./keys.ts`), and where it was written. */
export type AutomationStudioFlowScriptOnlyAfter = {
  label: string;
  line: number;
};

/** A line naming a step or a block by label, reduced as a branch target is, and where it was written. */
export type AutomationStudioFlowScriptLabelLine = {
  label: string;
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
  /** The `repeat most:` line itself, for a refusal that names it (`../script-statements/repeat-bound.ts`). */
  mostLine?: number;
  /** The least time between two passes, as written: `6 s`, `1500 ms`, `1 min`; a bare number is seconds (`../script-statements/repeat-pace.ts`). */
  pace?: string;
  /** The `repeat pace:` line itself, for a refusal that names it. */
  paceLine?: number;
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

/** A block of steps: the main sequence, a named subflow or part, or a handler's body. */
export type AutomationStudioFlowScriptBlock = {
  /**
   * The label a `subflow <label>:` or `part <label>:` line gave; absent for
   * the main block. A handler's block has one Core gave it, starting `:`,
   * which no written label can equal.
   */
  label?: string;
  name: string;
  role?: AutomationStudioFlowBootstrapPlan["subflows"][number]["role"];
  /**
   * When the router runs this block; every line must hold. Absent, nothing
   * routes to it by condition. In a handler's block these are the facts that
   * must hold for the handler to run (`../script-statements/fact-condition.ts`).
   */
  when?: AutomationStudioFlowScriptCondition[];
  /**
   * The block's `done when:` lines: the facts that prove it worked -- a part's
   * success check, or a handler's completion check.
   */
  done?: AutomationStudioFlowScriptCondition[];
  /** A part's `input: <name>` lines. */
  inputs?: AutomationStudioFlowScriptLabelLine[];
  /** A part's `output: <name> = <binding>` lines. */
  outputs?: AutomationStudioFlowScriptOutput[];
  /** The block's `start at: <step>` lines, each with the `when:` lines written after it. */
  entries?: AutomationStudioFlowScriptEntryPoint[];
  /** Set on a handler's block: what its `on ...:` line said. */
  handler?: AutomationStudioFlowScriptHandler;
  steps: AutomationStudioFlowScriptStep[];
  line: number;
};

/** A part's `output: <name> = <binding>` line, as written. */
export type AutomationStudioFlowScriptOutput = {
  name: string;
  binding: string;
  line: number;
};

/** A `start at: <step>` line and the `when:` lines written after it. */
export type AutomationStudioFlowScriptEntryPoint = {
  /** The label of the step the run may start at, reduced as a branch target is. */
  step: string;
  when: AutomationStudioFlowScriptCondition[];
  line: number;
};

/**
 * A handler's `on <event> [for ...]: <situation>` line, as written. Its block
 * holds its `when:` and `done when:` lines and the steps of its body; `then`
 * is its `then:` line. What each means is
 * `../script-statements/handler-blocks.ts`'s.
 */
export type AutomationStudioFlowScriptHandler = {
  event: "before" | "retry" | "fail" | "start" | "next";
  /** The words between the event and the colon: `for <labels>`, `for this part`, `everywhere`, or none. */
  scope: string;
  situation: string;
  then?: AutomationStudioFlowScriptOptional;
  /** The index, in `AutomationStudioFlowScript.blocks`, of the block it was written in; absent when that block holds no step. */
  parent?: number;
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
  | { ok: true; summary: string; plan: AutomationStudioFlowBootstrapPlan; issues: AutomationStudioFlowBootstrapIssue[]; script?: string; locator?: AutomationStudioFlowBootstrapIssueLocator }
  | { ok: false; issues: AutomationStudioFlowBootstrapIssue[]; refusedPlan?: AutomationStudioFlowBootstrapPlan; script?: string; locator?: AutomationStudioFlowBootstrapIssueLocator };

/**
 * Where one refusal is in what the model wrote: the step as it wrote it.
 *
 * A refusal used to name a plan path -- `plan.subflows.0.nodes.10.parameters`
 * -- and nothing else. A script's steps do not become nodes one for one (an
 * optional step becomes two, a loop several more), so "node 10" named no step
 * the model could find: lane B (`run-mv0fu9pb-57454dc4`, 0058) guessed two
 * other steps, sent its script again unchanged, and the repeat guard ended the
 * build. Each field is the model's own writing or a line number of it.
 */
export type AutomationStudioFlowScriptPlace = {
  /** The step's description as the model wrote it; for a block's own line, the block's name; for a JSON plan, the node's name. */
  step: string;
  /** The step's label, when it wrote one; for a JSON plan, the node's key. */
  label?: string;
  /** The 1-based script line the issue is about; absent for a JSON plan, which has no lines. */
  line?: number;
};

/**
 * Every place a refusal's path can name, read off the script (or JSON plan) an
 * acceptance came from, so any check after it -- assembly, the domain's
 * resolution, registry validation, the candidate's bindings -- can say which
 * step it refused (`./locate-issue.ts`). Plain data: it travels on the
 * acceptance and the completion verdict.
 */
export type AutomationStudioFlowBootstrapIssueLocator = {
  /** Exact issue paths raised for a written step that became no node, such as one naming no node. */
  paths: Record<string, AutomationStudioFlowScriptPlace>;
  /** `plan.subflows.<S>.nodes.<M>`, by `"<S>.<M>"`: the written step the node is, or the one whose statement made it. */
  nodes: Record<string, AutomationStudioFlowScriptPlace>;
  /** `plan.subflows.<S>.edges.<E>`, by `"<S>.<E>"`: the step the edge leaves. */
  edges: Record<string, AutomationStudioFlowScriptPlace>;
  /** `plan.subflows.<S>`, by `"<S>"`: its block, or its first step for the steps outside every block. */
  subflows: Record<string, AutomationStudioFlowScriptPlace>;
  /** `plan.router.rules.<R>`, by `"<R>"`: the block the rule runs. */
  rules: Record<string, AutomationStudioFlowScriptPlace>;
  /** `plan.router.fallback`: the block that runs when no rule holds. */
  fallback?: AutomationStudioFlowScriptPlace;
  /**
   * For `flow.line.<N>`: each written step by the line it starts on, and each
   * block's own lines (`subflow`, `when:`, `unless:`) exactly, in line order.
   * A line inside a step is that step's.
   */
  lines: { line: number; place: AutomationStudioFlowScriptPlace; exact?: true }[];
};
