// Where else a block may start, and where a handler may bring a run back to
// (t388, contract C2, C12).
//
//   start at: search                 the block may start at the step labelled search
//   when: exists t4                  when the page already shows what that step needs
//   ...
//   step search: search the catalogue
//     checkpoint: yes                a handler's `then: go to search` may return here
//
// A `start at:` becomes the node's `fluxiq.entry`: the run starts there, rather
// than at the block's first step, when every one of its facts holds and every
// input the step reads is given; entries are tried in the order written. A
// `checkpoint: yes` becomes the node's `fluxiq.checkpoint`, the only place a
// handler's route may go. Both carry the inputs their step reads without a
// default as `requires`, which the runtime checks are bound before it starts
// there.
//
// Refused, each at its line: a `start at:` naming no step of its block, its
// first step, or a step inside a repeat span (whose row would not exist yet);
// one with no `when:` line, which would always hold; one in a handler, whose
// body starts where it starts; a `when:` under it that is not a fact; and a
// checkpoint line that is neither yes nor no, that stands inside a span, or
// that is in a handler's body.
import type { AutomationStudioFlowBootstrapIssue, AutomationStudioFlowBootstrapNodeMetadata } from "../plan/index.ts";
import type { AutomationStudioFlowScriptBlock, AutomationStudioFlowScriptStep } from "../authoring/index.ts";
import { automationStudioFlowScriptFacts } from "./fact-condition.ts";
import { automationStudioFlowScriptSpans } from "./script-spans.ts";
import { scriptStatementRefusal } from "./statement-refusal.ts";

const YES = new Set(["", "yes", "true", "y"]);
const NO = new Set(["no", "false", "n"]);
/** A Flow or part input a step reads, in any of its values. */
const INPUT_READ = /\$input\.([a-z][A-Za-z0-9]{0,31})/gu;

/**
 * One block's entries and checkpoints, as the metadata each labelled step's
 * node carries, and the checkpoint id of each checkpoint step by label.
 * `steps` are the block's steps as written, before any statement was lowered.
 */
export function automationStudioFlowScriptEntryPoints(input: {
  block: AutomationStudioFlowScriptBlock;
  /** Whether a label names a step of another block. */
  elsewhere(label: string): boolean;
}): {
  metadata: ReadonlyMap<string, AutomationStudioFlowBootstrapNodeMetadata>;
  checkpoints: ReadonlyMap<string, string>;
  issues: AutomationStudioFlowBootstrapIssue[];
  /** Whether any entry here tests a fact, so the Flow requires the host to observe one. */
  facts: boolean;
} {
  const { block } = input;
  const issues: AutomationStudioFlowBootstrapIssue[] = [];
  const metadata = new Map<string, AutomationStudioFlowBootstrapNodeMetadata>();
  const checkpoints = new Map<string, string>();
  const spans = automationStudioFlowScriptSpans(block.steps);
  for (const [index, step] of block.steps.entries()) {
    const written = step.checkpoint;
    if (!written) continue;
    const answer = written.text.toLowerCase().replace(/[^a-z0-9]+/gu, "");
    if (NO.has(answer)) continue;
    const at = `The step at line ${step.line} says checkpoint`;
    if (!YES.has(answer)) {
      issues.push(scriptStatementRefusal("flow_script.checkpoint_invalid", `${at}: ${JSON.stringify(written.text.slice(0, 40))}. Write \`checkpoint: yes\` on a step a handler may bring the run back to, or leave the line out.`, written.line));
      continue;
    }
    if (block.handler) {
      issues.push(scriptStatementRefusal("flow_script.checkpoint_invalid", `${at}, and it is a step of a handler. A handler brings the run back to a step of a block or part; its own steps are not a place to come back to.`, written.line));
      continue;
    }
    if (spans[index]) {
      issues.push(scriptStatementRefusal("flow_script.checkpoint_invalid", `${at}, and it is inside the repeat span that starts at line ${block.steps[spans[index]!.head]!.line}. A run brought back into the middle of a repeat would have no pass or row to be on: mark a step before the span, or the listing step it repeats over.`, written.line));
      continue;
    }
    if (step.label === undefined) {
      issues.push(scriptStatementRefusal("flow_script.checkpoint_invalid", `${at} but has no label, so no handler could name it. Write it as \`step <label>: ...\`.`, written.line));
      continue;
    }
    const id = symbolOf(step.label) ?? `checkpoint${checkpoints.size + 1}`;
    checkpoints.set(step.label, id);
    metadata.set(step.label, { "fluxiq.checkpoint": { id, requires: inputsRead(step) } });
  }
  let facts = false;
  for (const [order, entry] of (block.entries ?? []).entries()) {
    const at = `The \`start at:\` at line ${entry.line} names "${entry.step.slice(0, 60)}"`;
    const refuse = (message: string): void => {
      issues.push(scriptStatementRefusal("flow_script.entry_invalid", message, entry.line));
    };
    if (block.handler) {
      refuse(`The \`start at:\` at line ${entry.line} is in a handler. A handler's steps run from its first step; write \`start at:\` in the block or part whose run may begin further on.`);
      continue;
    }
    const index = block.steps.findIndex((step) => step.label === entry.step);
    if (index < 0) {
      refuse(input.elsewhere(entry.step)
        ? `${at}, a step of another block. A block starts only at one of its own steps.`
        : `${at}, which labels no step. Write \`start at: <label>\` with the label of a step in the same block.`);
      continue;
    }
    if (index === 0) {
      refuse(`${at}, the block's first step, where it starts anyway. Name the step a run may start at instead, further on.`);
      continue;
    }
    if (spans[index]) {
      refuse(`${at}, which is inside the repeat span that starts at line ${block.steps[spans[index]!.head]!.line}, so a run starting there would have no pass or row. Start at a step outside every span.`);
      continue;
    }
    if (!entry.when.length) {
      refuse(`${at} with no \`when:\` line under it, so it would always be taken. Say what the page shows when the run can start there: \`when: exists t4\`.`);
      continue;
    }
    const when = automationStudioFlowScriptFacts(entry.when, issues);
    if (!when) continue;
    facts = true;
    const step = block.steps[index]!;
    const id = symbolOf(entry.step) ?? `entry${order + 1}`;
    metadata.set(entry.step, { ...metadata.get(entry.step), "fluxiq.entry": { id, order: order + 1, when, requires: inputsRead(step) } });
  }
  return { metadata, checkpoints, issues, facts };
}

/**
 * Every input a step's values read by name without a default, in the order
 * first read. A read written with its default (`$input.title = Gardening`) is
 * always bound, since the step falls back to that value, so it never keeps a
 * run from starting there (recovery matrix row 2, t404).
 */
function inputsRead(step: AutomationStudioFlowScriptStep): string[] {
  const names = new Set<string>();
  for (const entry of step.entries) {
    const text = entry.lines.join("\n");
    for (const match of text.matchAll(INPUT_READ)) {
      const defaulted = /^\s*=/u.test(text.slice((match.index ?? 0) + match[0].length));
      if (!defaulted) names.add(match[1]!);
    }
  }
  return [...names];
}

/** A label as an entry or checkpoint id: the plan's symbolic key syntax, or `undefined`. */
function symbolOf(label: string): string | undefined {
  const symbol = label.toLowerCase().replace(/[^a-z0-9_-]+/gu, "-").replace(/^[-_]+|[-_]+$/gu, "").slice(0, 64);
  return /^[a-z]/u.test(symbol) ? symbol : undefined;
}
