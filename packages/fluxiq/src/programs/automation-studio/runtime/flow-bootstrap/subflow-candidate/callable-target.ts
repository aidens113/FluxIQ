// A callable subflow's submission: a brief whose scope has an `interface`
// (t537, supervisor decision). Such a subflow is a part: it is given inputs
// and hands back outputs. So the builder writes it in the grammar parts
// already have (`../plan/flow-script-format.ts`, the state format):
//
//   part <subflowKey>: <what it does>
//     input: <name>                      one per input of the scope's interface
//     output: <name> = $step.<label>.<output>   one per output, bound
//     step ... (its own steps; helper parts it calls are further `part` blocks)
//   end
//
// and writes nothing outside every block. The existing checks run on a whole
// plan, and a part nothing calls is refused there as unreachable, so the probe
// is the script with a call appended: one step outside every block that calls
// the part, passing each input as the Flow's own. That call exists for the
// check alone; the proposal is the part and its helpers (`./scoped-submission.ts`).
//
// The part's inputs and outputs are compared with the scope's by name before
// anything is assembled, so a mismatch is refused at the builder's own lines
// rather than as a refusal of the appended call it never wrote.
//
// The probe is never shown to the builder: a refusal of it carries the script
// it checked as `previous`, and the scoped submission puts the script the
// builder sent there instead (`./scoped-submission.ts`, t581). On the A8 bigbox
// run that `previous` was the probe, and builders resent its lines.
//
// **Every input it declares is read (t581).** A part that declares an
// `input:` none of its lines reads is refused `subflow.input_unread`, naming
// the input: on the A8 bigbox run later subflows declared `storeName`, as the
// plan gave it, and none of their steps read it, which no check of the plan
// can see. A read is `$input.<name>` written anywhere in the part's own lines
// but its `input:` lines -- a step's value, a condition or `done when:` fact, a
// value given on to a part it calls, an output line -- or in a handler written
// inside the part. A helper part's own `$input` reads are its own inputs, not
// this part's, so they do not count.
import { parseAutomationStudioFlowScript } from "../authoring/index.ts";
import type { AutomationStudioFlowBootstrapInterface } from "../plan/index.ts";
import type { AutomationStudioSubflowScopeIssue } from "./scope-issue.ts";

/** The appended call's label, which no builder is shown (header); a builder step with this label is refused as a collision by the parser. */
export const AUTOMATION_STUDIO_SUBFLOW_PROBE_CALL_LABEL = "subflow-probe-call";

/**
 * Reads a callable subflow's script against its scope: the issues that refuse
 * it, or the probe script to check (header). `flow` is the script as sent.
 */
export function automationStudioSubflowCallableProbe(input: { flow: string; subflowKey: string; contract: AutomationStudioFlowBootstrapInterface }): { issues: AutomationStudioSubflowScopeIssue[]; probe?: string } {
  const { script } = parseAutomationStudioFlowScript(input.flow);
  const issues: AutomationStudioSubflowScopeIssue[] = [];
  const outside = script.blocks.find((block) => block.label === undefined && !block.handler);
  const stray = outside?.steps[0];
  if (stray) issues.push({ code: "subflow.steps_outside_part", path: `flow.line.${stray.line}`, message: `The step at line ${stray.line} is outside every block. "${input.subflowKey}" is given inputs and hands back outputs, so it is written as \`part ${input.subflowKey}: <what it does>\` with its steps inside, then \`end\`; nothing stands outside every block.` });
  const target = script.blocks.find((block) => !block.handler && block.label === input.subflowKey);
  if (!target) {
    issues.push({ code: "subflow.target_part_missing", path: "flow", message: `No \`part ${input.subflowKey}:\` block was written. Write this subflow as that part: its \`input:\` and \`output:\` lines, its steps, then \`end\`.` });
    return { issues };
  }
  const expectedInputs = input.contract.inputs.map((port) => port.id);
  const writtenInputs = (target.inputs ?? []).map((line) => line.label);
  if (!sameNames(expectedInputs, writtenInputs)) {
    issues.push({ code: "subflow.interface_input_mismatch", path: `flow.line.${target.inputs?.[0]?.line ?? target.line}`, message: `"${input.subflowKey}" is given exactly ${said(expectedInputs)}; this part declares ${said(writtenInputs)}. Write one \`input: <name>\` line for each, by those names.` });
  }
  const expectedOutputs = input.contract.outputs.map((port) => port.id);
  const written = target.outputs ?? [];
  for (const output of written.filter((line) => !expectedOutputs.includes(line.name))) {
    issues.push({ code: "subflow.interface_output_mismatch", path: `flow.line.${output.line}`, message: `The output "${output.name}" at line ${output.line} is not one of this subflow's outputs, which are ${said(expectedOutputs)}. Hand back exactly those, by those names.` });
  }
  const unbound = expectedOutputs.filter((name) => !written.some((line) => line.name === name && line.binding.trim()));
  if (unbound.length) {
    issues.push({ code: "subflow.output_unbound", path: `flow.line.${target.line}`, message: `This subflow must hand back ${said(unbound)}, and the part binds ${unbound.length === 1 ? "it" : "them"} to nothing. Write \`output: <name> = $step.<label>.<output>\` for each, naming one of the part's own steps.` });
  }
  // A declared input nothing in the part reads (header, t581): asked only of the scope's own names, once they match.
  if (!issues.length) {
    const own = script.blocks.indexOf(target);
    const reads = JSON.stringify([{ ...target, inputs: undefined }, ...script.blocks.filter((block) => block.handler?.parent === own)]);
    for (const line of target.inputs ?? []) {
      if (readsInput(reads, line.label)) continue;
      issues.push({ code: "subflow.input_unread", path: `flow.line.${line.line}`, message: `The input "${line.label}" at line ${line.line} is declared, and no line of this part reads it. `
        + `A part reads an input as \`$input.${line.label}\`: in a step's value, in a condition or \`done when:\` fact, or given on to a part it calls (\`${line.label}: $input.${line.label}\`). `
        + "Read it where this subflow uses it. If this subflow has no use for it, the plan gives it a value it does not need: end the brief blocked and name the input, so the plan can change." });
    }
  }
  if (issues.length) return { issues };
  // Every block closed first, then the call, so the steps it names stay where the builder wrote them (header).
  const call = [`step ${AUTOMATION_STUDIO_SUBFLOW_PROBE_CALL_LABEL}: run ${input.subflowKey}`, `  call: ${input.subflowKey}`, ...expectedInputs.map((name) => `  ${name}: $input.${name} = example`)];
  return { issues, probe: [input.flow, "end", "end", ...call].join("\n") };
}

/** Whether the part's written lines name `$input.<name>`, and not a longer name that starts with it. */
function readsInput(written: string, name: string): boolean {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(`\\$input\\.${escaped}(?![A-Za-z0-9])`, "u").test(written);
}

function sameNames(expected: readonly string[], written: readonly string[]): boolean {
  return expected.length === written.length && [...expected].sort().every((name, index) => name === [...written].sort()[index]);
}

function said(names: readonly string[]): string {
  return names.length ? names.map((name) => `"${name}"`).join(", ") : "no value";
}
