import type { JsonObject } from "../../../../../core/index.ts";
import { parseAutomationStudioFlowScript } from "../../flow-bootstrap/authoring/index.ts";
import { AUTOMATION_STUDIO_SUBFLOW_SUBMIT_TOOL_ID } from "../../flow-bootstrap/subflow-candidate/index.ts";
import type { AutomationStudioLlmEvidenceLoopInput } from "../../llm/evidence-loop.ts";
import type { AutomationStudioProjectBuilderReturn, AutomationStudioProjectSubflowBrief } from "../contracts/index.ts";
import { automationStudioProjectDispatchEnding as ending } from "./ending.ts";
import type { AutomationStudioProjectBriefEnding } from "./types.ts";

// What one brief's submissions were refused for binding an output to no value
// (A8 frozen pair 3 bigbox, t645). `run-mv9zn5ob-d929084d` planned an output
// its producer had no step to make: the builder bound it to a read's declared
// ports, to a port its node does not declare, to a success port, and the
// repeat guard ended two briefs after fourteen refusals, every one of them the
// plan's fault. So the submit tool's answers are watched (`watch`): once one
// output of the brief's interface was refused `subflow.output_not_a_value` or
// `subflow.output_unknown_port` under two different bindings, Core ends the
// brief itself (`ending`), blocked with the output's name and the plan's
// advice (`./ending.ts`, `outputStopped`), before the builder's next turn. A
// binding is read from the script's own `output: <name> = <binding>` line,
// else from the refusal's sentence, which names the port. And a return that is
// not done after a latest submission refused on an output names that output
// (`marked`), so the supervisor's next step names the subflow that takes it.
// Only Core's own port names are said, never the binding the model wrote.

type Loop = AutomationStudioLlmEvidenceLoopInput;

/** The scope issues that say an output is bound to no value, each at `flow.output.<id>` (`../../flow-bootstrap/subflow-candidate/route-outputs.ts`). */
const OUTPUT_CODES: ReadonlySet<string> = new Set(["subflow.output_not_a_value", "subflow.output_unknown_port"]);
const OUTPUT_PATH = /^flow\.output\.([A-Za-z][A-Za-z0-9_]*)$/u;
/** How many different bindings of one output are refused before Core ends the brief (header). */
const BINDINGS_BEFORE_STOP = 2;

export class AutomationStudioProjectDispatchOutputRefusals {
  private readonly stop = new AbortController();
  /** Each output's refused bindings, and the codes it was refused under. */
  private readonly refused = new Map<string, { bindings: Set<string>; codes: Set<string> }>();
  /** The outputs the latest submission was refused on; empty once one was accepted or refused for anything else. */
  private latest: string[] = [];
  private stopped: string | undefined;
  private readonly declared: ReadonlySet<string>;

  constructor(brief: AutomationStudioProjectSubflowBrief) {
    this.declared = new Set((brief.interface?.outputs ?? []).map((port) => port.id));
  }

  /** `loop`, its submit tool's answers read for output refusals (header). */
  watch(loop: Loop): Loop {
    const inner = loop.executeTool;
    const executeTool: Loop["executeTool"] = async (call) => {
      const ran = await inner(call);
      if (call.toolId === AUTOMATION_STUDIO_SUBFLOW_SUBMIT_TOOL_ID) this.answered(call.value, ran);
      return ran;
    };
    return { ...loop, executeTool };
  }

  /** The brief's own ending, joined with `other` (the ports' permission and person-needed ending), which comes first. */
  ending(other: AutomationStudioProjectBriefEnding | undefined): AutomationStudioProjectBriefEnding {
    const own = this.stop.signal;
    return {
      signal: other ? AbortSignal.any([other.signal, own]) : own,
      reason: () => (other?.signal.aborted ? other.reason() : this.stopped)
    };
  }

  /** `returned`, naming the output its latest submission was refused on when it is not done (header). */
  marked(returned: AutomationStudioProjectBuilderReturn): AutomationStudioProjectBuilderReturn {
    const output = this.latest[0];
    return returned.outcome !== "done" && output !== undefined && returned.unmadeOutput === undefined ? { ...returned, unmadeOutput: output } : returned;
  }

  private answered(value: JsonObject, ran: unknown): void {
    const evidence = isObject(ran) && isObject(ran.evidence) ? ran.evidence : undefined;
    if (evidence?.ok === true) this.latest = [];
    if (evidence?.ok !== false) return;
    const issues = isObject(evidence.diagnostics) && Array.isArray(evidence.diagnostics.issues) ? evidence.diagnostics.issues.filter(isObject) : [];
    const outputs = new Map<string, { codes: Set<string>; message: string }>();
    for (const issue of issues) {
      const code = typeof issue.code === "string" ? issue.code : "";
      const named = OUTPUT_CODES.has(code) && typeof issue.path === "string" ? OUTPUT_PATH.exec(issue.path)?.[1] : undefined;
      if (!named || !this.declared.has(named)) continue;
      const seen = outputs.get(named) ?? { codes: new Set<string>(), message: "" };
      seen.codes.add(code);
      seen.message += typeof issue.message === "string" ? issue.message : code;
      outputs.set(named, seen);
    }
    this.latest = [...outputs.keys()];
    const written = boundOutputs(value);
    for (const [output, seen] of outputs) {
      const held = this.refused.get(output) ?? { bindings: new Set<string>(), codes: new Set<string>() };
      held.bindings.add(written.get(output) ?? seen.message);
      for (const code of seen.codes) held.codes.add(code);
      this.refused.set(output, held);
      if (this.stopped === undefined && held.bindings.size >= BINDINGS_BEFORE_STOP) {
        this.stopped = ending.outputStopped(output, [...held.codes]);
        this.stop.abort();
      }
    }
  }
}

/** Each part output the submitted script binds, by its name: what it is bound to, as written. */
function boundOutputs(value: JsonObject): Map<string, string> {
  const bound = new Map<string, string>();
  if (typeof value.flow !== "string") return bound;
  for (const block of parseAutomationStudioFlowScript(value.flow).script.blocks) {
    for (const output of block.outputs ?? []) if (!bound.has(output.name)) bound.set(output.name, output.binding.replace(/\s+/gu, ""));
  }
  return bound;
}

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
