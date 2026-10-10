// A step that is only sometimes needed, and the steps that run only when it was
// done: a script's `optional:` and `only after:` lines made into the graph shape
// that says so.
//
//   optional.failed -> join (a Merge)        optional.success falls into the
//                                            first guarded step, the last one
//                                            falls into the join
//
// With no step saying `only after:`, the optional step's success falls straight
// into the join, which is the shape a drafted `optional` step becomes
// (`../authoring/draft-routing.ts`), so a step a model marked optional in a script and one
// a build drafted as optional are one graph shape, and the runtime treats both
// as sometimes present: an absent target is skipped with no retry and no fault,
// exactly as `metadata.sometimesPresent` is
// (`../../executor/step-skip/absent-step.ts`).
//
// **Inside a repeat span too (t378).** A site that asks a run to slow down
// shows its notice on some passes and not on others, so the step that closes it
// is optional on every pass, and the wait the site asked for belongs only on the
// passes where the notice was there: lane D (`run-mv0fuual-f9e6f089`) could say
// neither, because an optional step inside a span was refused and its way past
// would have been refused again as a branch inside the span. The way past is
// now a branch Core writes (`guard`), to a join inside the same span, which the
// span takes (`../authoring/draft-routing.ts`, `scriptSpan`); and a span whose last step
// is the guarded group's last ends at the join instead, so a pass that went
// past the group still goes round. Then the pass goes on where it was.
//
// Refused, each naming its line and what to write instead: an `optional:` value
// that is neither yes nor no; an optional step that runs a block, branches with
// its own `on <port>:` line, has no `failed` way out, or is the last step of a
// `repeat while` span (the check whose success repeats it); and an `only after:`
// that names no step, a step of another block, a step that is not optional, or
// one not written directly before it, or that stands in another span than the
// step it names. A step whose node is unknown is left for the node's own
// refusal, and so are the steps that run only after it.
import type { AutomationStudioNodeDefinition, AutomationStudioNodeRegistry, AutomationStudioNodeRegistryResolution } from "../../../nodes/index.ts";
import type { AutomationStudioFlowBootstrapIssue } from "../plan/index.ts";
import type { AutomationStudioFlowScriptStep } from "../authoring/index.ts";
import { scriptStatementRefusal } from "./statement-refusal.ts";
import { automationStudioFlowScriptSpans, type AutomationStudioFlowScriptSpan } from "./script-spans.ts";

/** The node a guarded group's two ways out meet at, as `../authoring/draft-routing.ts` writes a drafted one. */
const MERGE_NODE_ID = "builtin.control.merge";
/** The port an optional step is skipped on; the runtime reads it by this id (`../../executor/step-skip/absent-step.ts`). */
const FAILED_PORT = "failed";
/** An `optional:` value that says yes: the word alone means it. */
const OPTIONAL_YES = new Set(["", "yes", "true", "y", "optional"]);
/** An `optional:` value that says no, which leaves the step as if the line were absent. */
const OPTIONAL_NO = new Set(["no", "false", "n"]);
/** The code every `only after:` refusal is made under; each sentence is Core's own and quotes only labels and lines. */
const ONLY_AFTER_MISPLACED = "flow_script.only_after_misplaced";

/**
 * What one step's `optional:` line came to: an optional step, a step as if the
 * line were absent, one refused, or one whose node is unknown and refused for
 * that instead.
 */
type OptionalReading = "optional" | "plain" | "refused" | "unresolved";

/**
 * One block with each `optional: yes` step, and the steps that run only after
 * it, made into the guarded shape, or the issues that refused it. A block with
 * neither line comes back as it was, the same array.
 */
export function automationStudioFlowScriptGuardedSteps(input: {
  steps: readonly AutomationStudioFlowScriptStep[];
  blockIndex: number;
  /**
   * The definition a step names, matched the way the assembler matches it, or
   * nothing when it names none. Passed in, so this reads a step's node through
   * the assembler's one matcher (`../authoring/matching.ts`) rather than a second.
   */
  definitionOf(step: AutomationStudioFlowScriptStep): AutomationStudioNodeDefinition | undefined;
  registry: AutomationStudioNodeRegistry;
  resolution: AutomationStudioNodeRegistryResolution;
  /** Whether a label names a step of another block. */
  elsewhere(label: string): boolean;
}): { steps: readonly AutomationStudioFlowScriptStep[]; issues: AutomationStudioFlowBootstrapIssue[] } {
  const { steps } = input;
  if (!steps.some((step) => step.optional || step.onlyAfter)) return { steps, issues: [] };
  const issues: AutomationStudioFlowBootstrapIssue[] = [];
  const spans = automationStudioFlowScriptSpans(steps);
  const merges = input.registry.get(MERGE_NODE_ID, input.resolution) !== undefined;
  const readings = steps.map((step, index) => readOptional({ step, index, steps, spans, merges, definitionOf: input.definitionOf, issues }));
  // Each optional step's guarded group, by its index: the steps directly after
  // it that say `only after:` its label, up to the first one refused.
  const groups = new Map<number, number[]>();
  const grouped = new Set<number>();
  const answered = new Set<number>();
  for (const [index, reading] of readings.entries()) {
    if (reading !== "optional") continue;
    const label = steps[index]!.label;
    const members: number[] = [];
    let open = true;
    for (let next = index + 1; label !== undefined && next < steps.length && steps[next]!.onlyAfter?.label === label; next += 1) {
      answered.add(next);
      if (!open) continue;
      const refusal = memberRefusal({ steps, spans, readings, member: next, optional: index });
      if (refusal === undefined) {
        members.push(next);
        grouped.add(next);
        continue;
      }
      open = false;
      if (refusal) issues.push(scriptStatementRefusal(ONLY_AFTER_MISPLACED, refusal, steps[next]!.onlyAfter!.line));
    }
    groups.set(index, members);
  }
  for (const [index, step] of steps.entries()) {
    if (!step.onlyAfter || answered.has(index) || readings[index] === "refused") continue;
    const refusal = strayRefusal({ steps, readings, index, elsewhere: input.elsewhere });
    if (refusal) issues.push(scriptStatementRefusal(ONLY_AFTER_MISPLACED, refusal, step.onlyAfter.line));
  }

  const emitted: AutomationStudioFlowScriptStep[] = [];
  const position = new Map<number, number>();
  let joins = 0;
  for (const [index, written] of steps.entries()) {
    if (grouped.has(index)) continue;
    position.set(index, emitted.length);
    const members = readings[index] === "optional" ? groups.get(index) : undefined;
    if (!members) {
      emitted.push(stripped(written));
      continue;
    }
    // A label no written one can equal: a written label ends at its line's
    // first colon (`../authoring/parse.ts`). The block is in it because labels are
    // counted across every block.
    const join = `:optional${input.blockIndex}.${(joins += 1)}`;
    emitted.push({ ...stripped(written), branches: [{ port: FAILED_PORT, target: join, guard: true, line: written.optional!.line }] });
    for (const member of members) {
      position.set(member, emitted.length);
      emitted.push(stripped(steps[member]!));
    }
    emitted.push({ label: join, description: "the paths after an optional step meet here", node: MERGE_NODE_ID, entries: [], branches: [], line: 0, cause: written.line });
    // A span that ended at the group's last step ends at its join, so a pass
    // that went past the group still closes the loop. A `repeat while` span
    // never ends inside a group: its last step is refused above.
    const span = spans[index];
    if (span && !span.repeatsWhile && span.end === (members.at(-1) ?? index)) {
      const at = position.get(span.head)!;
      const head = emitted[at]!;
      emitted[at] = { ...head, repeat: { ...head.repeat!, through: join } };
    }
  }
  return { steps: emitted, issues };
}

/**
 * Whether a written step's `optional:` line says yes, read exactly as the
 * guarded shape reads it -- whether or not that shape could then be built.
 * For a check after assembly that asks what an optional step may do
 * (`./way-out-steps.ts`).
 */
export function automationStudioFlowScriptStepSaysOptional(step: AutomationStudioFlowScriptStep): boolean {
  return step.optional !== undefined && OPTIONAL_YES.has(answerKey(step.optional.text));
}

/** An `optional:` value reduced as every authoring key is (`../authoring/keys.ts`): lower case, letters and digits only. */
function answerKey(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/gu, "");
}

/** A written step without its `optional:` and `only after:` lines, which the shape now says; the step itself when it had neither. */
function stripped(step: AutomationStudioFlowScriptStep): AutomationStudioFlowScriptStep {
  if (!step.optional && !step.onlyAfter) return step;
  const copy: AutomationStudioFlowScriptStep = { ...step };
  delete copy.optional;
  delete copy.onlyAfter;
  return copy;
}

/** What one step's `optional:` line comes to, with the refusal it earns pushed to `issues`. */
function readOptional(input: {
  step: AutomationStudioFlowScriptStep;
  index: number;
  steps: readonly AutomationStudioFlowScriptStep[];
  spans: ReadonlyArray<AutomationStudioFlowScriptSpan | undefined>;
  merges: boolean;
  definitionOf(step: AutomationStudioFlowScriptStep): AutomationStudioNodeDefinition | undefined;
  issues: AutomationStudioFlowBootstrapIssue[];
}): OptionalReading {
  const { step } = input;
  const optional = step.optional;
  if (!optional) return "plain";
  const at = `The step at line ${step.line}`;
  const refuse = (code: string, message: string): OptionalReading => {
    input.issues.push(scriptStatementRefusal(code, message, optional.line));
    return "refused";
  };
  const answer = answerKey(optional.text);
  if (OPTIONAL_NO.has(answer)) return "plain";
  if (!OPTIONAL_YES.has(answer)) {
    return refuse("flow_script.optional_invalid", `${at} says optional: ${JSON.stringify(optional.text.slice(0, 40))}. Write \`optional: yes\` on a step that is only sometimes needed, or leave the line out.`);
  }
  if (step.onlyAfter) {
    return refuse(ONLY_AFTER_MISPLACED, `${at} says optional and, at line ${step.onlyAfter.line}, only after "${step.onlyAfter.label.slice(0, 60)}". A step that runs only after another is already gone past with it, so it is not optional itself: take one of the two lines off.`);
  }
  if (step.runsBlock) {
    return refuse("flow_script.optional_misplaced", `${at} runs a block and says optional. Only a step that runs a node can be optional; a block runs by its \`when:\` line.`);
  }
  const span = input.spans[input.index];
  if (span?.repeatsWhile && span.end === input.index) {
    return refuse("flow_script.optional_misplaced", `${at} says optional and is the last step of the \`repeat while\` span that starts at line ${input.steps[span.head]!.line}: the step whose success repeats the span, so a pass that went past it would end the loop. Take the optional line off, or end the span at a step that always runs.`);
  }
  if (step.branches.length) {
    return refuse("flow_script.optional_misplaced", `${at} says optional and branches with \`on ${step.branches[0]!.port}:\` at line ${step.branches[0]!.line}. An optional step goes on to the next step whether or not it was done, so it takes no \`on <port>:\` line: remove one of the two.`);
  }
  const definition = input.definitionOf(step);
  if (!definition) return "unresolved";
  if (!definition.outputs.some((port) => port.id === FAILED_PORT)) {
    return refuse("flow_script.optional_misplaced", `${at} says optional, but ${definition.id} has no failed way out, so the run could not go on past it. Optional is for a step that acts on something the page may not be showing, such as closing a banner or a popup.`);
  }
  if (!input.merges) return refuse("flow_script.optional_unavailable", `${at} says optional, which needs "${MERGE_NODE_ID}", and this library does not offer it.`);
  return "optional";
}

/**
 * Why a step written directly after an optional step, and saying `only after:`
 * its label, cannot run in its group: a sentence, `null` when the step's own
 * refusal already says it, or `undefined` when it joins the group.
 */
function memberRefusal(input: {
  steps: readonly AutomationStudioFlowScriptStep[];
  spans: ReadonlyArray<AutomationStudioFlowScriptSpan | undefined>;
  readings: readonly OptionalReading[];
  member: number;
  optional: number;
}): string | null | undefined {
  const step = input.steps[input.member]!;
  const named = input.steps[input.optional]!;
  if (input.readings[input.member] === "refused") return null;
  const at = `The step at line ${step.line} runs only after "${named.label}" (line ${named.line})`;
  if (step.runsBlock) return `${at} and runs a block. A step that runs only after another runs a node; a block runs by its \`when:\` line.`;
  if (step.branches.length) {
    return `${at} and branches with \`on ${step.branches[0]!.port}:\` at line ${step.branches[0]!.line}. The steps that run only after an optional step go on, in order, to where the paths meet: take the branch out.`;
  }
  const span = input.spans[input.member];
  if (span !== input.spans[input.optional]) {
    return `${at}, and one of the two is inside a repeat span the other is not in. Keep an optional step and the steps that run only after it together: all inside the same span, its \`repeat through:\` naming the last of them, or all outside every span.`;
  }
  if (span?.repeatsWhile && span.end === input.member) {
    return `${at} and is the last step of the \`repeat while\` span that starts at line ${input.steps[span.head]!.line}: the step whose success repeats the span, so a pass that went past it would end the loop. End the span at a step that always runs.`;
  }
  return undefined;
}

/**
 * Why a step saying `only after:` stands in no optional step's group: a
 * sentence, or `null` when the step it names was refused for itself and that
 * refusal says it.
 */
function strayRefusal(input: {
  steps: readonly AutomationStudioFlowScriptStep[];
  readings: readonly OptionalReading[];
  index: number;
  elsewhere(label: string): boolean;
}): string | null {
  const step = input.steps[input.index]!;
  const label = step.onlyAfter!.label;
  const quoted = JSON.stringify(label.slice(0, 60));
  const at = `The step at line ${step.line} runs only after ${quoted}`;
  const named = input.steps.findIndex((candidate) => candidate.label === label);
  if (named < 0) {
    return input.elsewhere(label)
      ? `${at}, a step in another block. A step runs only after an optional step of its own block, written directly before it.`
      : `${at}, which labels no step. Write \`only after: <label>\` with the label of the optional step written directly before it.`;
  }
  const reading = input.readings[named];
  if (reading === "refused" || reading === "unresolved") return null;
  const where = `${at} (line ${input.steps[named]!.line})`;
  if (reading !== "optional") {
    return `${where}, which is not optional, so it always runs and this line would change nothing. Write \`optional: yes\` on that step if it is only sometimes needed, or take the only after line off.`;
  }
  return `${where}, which is not written directly before it. Move this step to right after that step, or right after the steps that already run only after it.`;
}
