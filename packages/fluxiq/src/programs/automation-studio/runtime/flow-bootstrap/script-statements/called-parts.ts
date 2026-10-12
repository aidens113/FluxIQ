// A block a step calls: a part, with the values it is given and hands back
// (t388, contract C1, C2, C12).
//
//   part checkout: pay for what is in the order        a block with no `when:`
//     input: card                                      a value it is given
//     output: receipt = $step.confirm.text             a value it hands back
//     step ... step confirm: ...                       its own steps
//   end
//   step pay: pay for the order
//     call: checkout                                   run the part and wait
//     card: $input.card = 4111                         its input, by name
//
// A block without `when:` used to be refused unless it was the steps outside
// every block, because the router would never run it; one a step calls is run
// by that step instead, and is a Subflow of its own that the call node names
// (`builtin.control.call-subflow`). A `step: run subflow <label>` naming such a
// block says the same as `call:` and is read as one; one naming a block with a
// `when:` is a router situation, as before, and left to the router.
//
// Nothing crosses into a part but its inputs, and nothing out but its outputs:
// a `$step` binding stays in its own block, and a part's step reads what it was
// given as `$input.<name>`. Each refusal names the line it is about.
import type { AutomationStudioFlowBootstrapIssue } from "../plan/index.ts";
import { AUTOMATION_STUDIO_FLOW_BOOTSTRAP_STATE_NODE_IDS } from "../plan/index.ts";
import type { AutomationStudioFlowScriptBlock, AutomationStudioFlowScriptOutput, AutomationStudioFlowScriptStep } from "../authoring/index.ts";
import { scriptStatementRefusal } from "./statement-refusal.ts";

/** One part: the block a step calls, by index, and its interface as written. */
export type AutomationStudioFlowScriptPart = {
  blockIndex: number;
  label: string;
  inputs: readonly string[];
  outputs: readonly AutomationStudioFlowScriptOutput[];
};

/** A part input's or output's name: a Flow input's rule (`flow-draft`), and never the row's name. */
const PORT_NAME = /^[a-z][A-Za-z0-9]{0,31}$/u;
const ROW_NAME = "item";

/**
 * Which blocks are parts, with each step that runs a part made a call to it and
 * each refusal the calls and interfaces earn. Blocks come back as they were
 * when no step calls anything, the same array.
 */
export function automationStudioFlowScriptCalledParts(blocks: readonly AutomationStudioFlowScriptBlock[]): {
  blocks: readonly AutomationStudioFlowScriptBlock[];
  parts: ReadonlyMap<number, AutomationStudioFlowScriptPart>;
  issues: AutomationStudioFlowBootstrapIssue[];
} {
  const issues: AutomationStudioFlowBootstrapIssue[] = [];
  const byLabel = new Map(blocks.flatMap((block, index) => block.label !== undefined && !block.handler ? [[block.label, index] as const] : []));
  const isPart = (index: number | undefined): index is number => index !== undefined && !blocks[index]!.when?.length;
  // A `run subflow` naming a block with no `when:` is a call; every other is left as it was.
  const out = blocks.map((block) => {
    if (!block.steps.some((step) => step.runsBlock !== undefined && isPart(byLabel.get(step.runsBlock)))) return block;
    return { ...block, steps: block.steps.map((step) => step.runsBlock !== undefined && isPart(byLabel.get(step.runsBlock)) ? asCall(step) : step) };
  });
  const called = new Map<number, number[]>();
  const targets = new Set<number>();
  for (const [blockIndex, block] of out.entries()) {
    for (const step of block.steps) {
      if (!step.calls) continue;
      const target = byLabel.get(step.calls.label);
      const at = `The step at line ${step.line} calls "${step.calls.label.slice(0, 60)}"`;
      if (target === undefined) {
        issues.push(scriptStatementRefusal("flow_script.unknown_block", `${at}, which no part declares. Write the part as \`part <label>: <what it does>\`, its steps, then \`end\`.`, step.calls.line));
        continue;
      }
      if (!isPart(target)) {
        issues.push(scriptStatementRefusal("flow_script.call_situation", `${at}, which has a \`when:\` line: that block is a situation the router picks before any step runs, not a part a step calls. Take the \`when:\` lines off it to call it, or take the call out.`, step.calls.line));
        continue;
      }
      if (step.node !== undefined) {
        issues.push(scriptStatementRefusal("flow_script.call_misplaced", `${at} and also names the node "${step.node.slice(0, 60)}". A step that calls a part runs that part, not a node: take one of the two lines out.`, step.calls.line));
        continue;
      }
      const owner = block.handler ? block.handler.parent : blockIndex;
      if (owner !== undefined) called.set(owner, [...(called.get(owner) ?? []), target]);
      called.set(target, called.get(target) ?? []);
      targets.add(target);
    }
  }
  const parts = new Map<number, AutomationStudioFlowScriptPart>();
  for (const index of targets) parts.set(index, partOf(out[index]!, index, issues));
  for (const [index, block] of out.entries()) {
    if (parts.has(index)) continue;
    for (const line of [...(block.inputs ?? []).map((input) => input.line), ...(block.outputs ?? []).map((output) => output.line)]) {
      issues.push(scriptStatementRefusal("flow_script.part_interface_invalid", `The line at ${line} declares an input or output of a block no step calls. Only a part a step calls with \`call: <part>\` takes \`input:\` and \`output:\` lines; the Flow's own inputs are written \`$input.<name> = <value>\` where a step uses them.`, line));
    }
  }
  issues.push(...callCycles(out, called, parts));
  return { blocks: out, parts, issues };
}

/**
 * A step that calls a part, as the call node it becomes: the part's Subflow by
 * key, each of the step's lines that names an input as that input, and the
 * part's outputs kept under their own names, which a later step reads as
 * `$step.<this step's label>.<output>`. Each line that names no input, and each
 * input no line gives, is refused at its line.
 */
export function automationStudioFlowScriptCallStep(step: AutomationStudioFlowScriptStep, part: AutomationStudioFlowScriptPart, subflowKey: string): {
  step: AutomationStudioFlowScriptStep;
  issues: AutomationStudioFlowBootstrapIssue[];
} {
  const issues: AutomationStudioFlowBootstrapIssue[] = [];
  const at = `The step at line ${step.line} calls "${part.label.slice(0, 60)}"`;
  const named = new Map(part.inputs.map((name) => [name.toLowerCase().replace(/[^a-z0-9]+/gu, ""), name]));
  const given = new Set<string>();
  const entries = step.entries.flatMap((entry) => {
    const name = named.get(entry.key.toLowerCase().replace(/[^a-z0-9]+/gu, ""));
    if (name === undefined) {
      issues.push(scriptStatementRefusal("flow_script.call_unknown_input", `${at}, which takes ${part.inputs.length ? `the inputs ${part.inputs.join(", ")}` : "no input"}; the line "${entry.key.slice(0, 60)}" at ${entry.line} names none of them. A step that calls a part gives only that part's inputs, one line each: \`<input>: <value>\`.`, entry.line));
      return [];
    }
    given.add(name);
    return [{ ...entry, key: `inputs.${name}` }];
  });
  const missing = part.inputs.filter((name) => !given.has(name));
  if (missing.length) {
    issues.push(scriptStatementRefusal("flow_script.call_input_missing", `${at} and gives no value for ${missing.join(", ")}. Give each input the part declares a line under the call: \`${missing[0]}: <value>\`.`, step.calls?.line ?? step.line));
  }
  const outputs = Object.fromEntries(part.outputs.map((output) => [output.name, output.name]));
  const derived: AutomationStudioFlowScriptStep = {
    ...step,
    node: AUTOMATION_STUDIO_FLOW_BOOTSTRAP_STATE_NODE_IDS.callSubflow,
    entries,
    derivedParameters: { subflowId: subflowKey, inputs: {}, outputs }
  };
  delete derived.calls;
  return { step: derived, issues };
}

/** A `step: run subflow <part>` as the `call:` line it means. */
function asCall(step: AutomationStudioFlowScriptStep): AutomationStudioFlowScriptStep {
  const call: AutomationStudioFlowScriptStep = { ...step, calls: { label: step.runsBlock!, line: step.line } };
  delete call.runsBlock;
  return call;
}

/** A part's interface, as written, with each malformed or repeated name refused at its line. */
function partOf(block: AutomationStudioFlowScriptBlock, blockIndex: number, issues: AutomationStudioFlowBootstrapIssue[]): AutomationStudioFlowScriptPart {
  const seen = new Set<string>();
  const accept = (name: string, line: number, what: string): boolean => {
    if (!PORT_NAME.test(name) || name === ROW_NAME) {
      issues.push(scriptStatementRefusal("flow_script.part_interface_invalid", `The ${what} "${name.slice(0, 40)}" at line ${line} is not a name a part's ${what} may have: it starts with a lower-case letter, holds only letters and digits, at most 32, and is never "${ROW_NAME}".`, line));
      return false;
    }
    if (seen.has(name)) {
      issues.push(scriptStatementRefusal("flow_script.part_interface_invalid", `The ${what} "${name}" at line ${line} is declared twice in the part "${block.label}"; each input and output has its own name.`, line));
      return false;
    }
    seen.add(name);
    return true;
  };
  const inputs = (block.inputs ?? []).filter((input) => accept(input.label, input.line, "input")).map((input) => input.label);
  const outputs = (block.outputs ?? []).filter((output) => accept(output.name, output.line, "output"));
  return { blockIndex, label: block.label!, inputs, outputs };
}

/** A part that calls itself, directly or through others, at the call that closes the circle. */
function callCycles(
  blocks: readonly AutomationStudioFlowScriptBlock[],
  called: ReadonlyMap<number, readonly number[]>,
  parts: ReadonlyMap<number, AutomationStudioFlowScriptPart>
): AutomationStudioFlowBootstrapIssue[] {
  const issues: AutomationStudioFlowBootstrapIssue[] = [];
  const state = new Map<number, "open" | "done">();
  const visit = (index: number): void => {
    state.set(index, "open");
    for (const target of called.get(index) ?? []) {
      if (!parts.has(target)) continue;
      if (state.get(target) === "open") {
        const line = callLine(blocks, index, blocks[target]!.label!);
        issues.push(scriptStatementRefusal("flow_script.call_cycle", `The part "${blocks[target]!.label}" is called again from inside itself (line ${line}), so a run would never come back out of it. A part may call other parts, never one it is already inside.`, line));
        continue;
      }
      if (!state.has(target)) visit(target);
    }
    state.set(index, "done");
  };
  for (const index of called.keys()) if (!state.has(index)) visit(index);
  return issues;
}

/** The line of the first call from a block, or its handlers, to the part with this label. */
function callLine(blocks: readonly AutomationStudioFlowScriptBlock[], owner: number, label: string): number {
  for (const [index, block] of blocks.entries()) {
    if (index !== owner && block.handler?.parent !== owner) continue;
    const step = block.steps.find((candidate) => candidate.calls?.label === label);
    if (step) return step.calls!.line;
  }
  return blocks[owner]!.line;
}
