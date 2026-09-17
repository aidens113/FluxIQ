// Reading a Flow script: text in, a script structure out.
//
// The grammar is deliberately tiny. A line is `key: value`, split at the first
// colon so the value keeps every later colon verbatim; a line with no colon
// continues the value above it; a line that is only `end` closes a block.
// Nothing nests, so indentation and blank lines carry no meaning at all and a
// model that lines its steps up wrongly still gets the Flow it wrote.
//
// A line this module cannot place is recorded as a warning and skipped, never
// fatal: a stray sentence in an otherwise complete script must not lose the
// Flow. What the script means -- which node, which parameter, which port --
// is decided against the registry in `./assemble.ts`, not here.
import type { AutomationStudioFlowBootstrapIssue } from "../plan/index.ts";
import type {
  AutomationStudioFlowScript,
  AutomationStudioFlowScriptBlock,
  AutomationStudioFlowScriptEntry,
  AutomationStudioFlowScriptStep
} from "./contracts.ts";
import { authoringError } from "./issue.ts";
import { authoringKey, authoringLabel } from "./keys.ts";

/** The most lines one script may hold, so a runaway reply is bounded before it is read. */
const MAX_SCRIPT_LINES = 2_000;
/** The most characters one value may reach across its continuation lines. */
const MAX_VALUE_LENGTH = 4_000;

const STEP_WORDS = new Set(["step", "action", "task", "then"]);
const BLOCK_WORDS = new Set(["subflow", "block"]);
const SUMMARY_WORDS = new Set(["flow", "summary", "goal", "title", "purpose"]);
const NODE_WORDS = new Set(["node", "use", "uses", "definition", "definitionid", "nodeid"]);
const ROLE_WORDS = new Set(["role", "kind"]);
const SUBFLOW_ROLES = new Set(["primary", "integration", "recovery", "fallback", "utility"]);
const RUNS_BLOCK = /^(?:run|call|enter)\s+(?:the\s+)?(?:subflow|block)\s+(.+)$/iu;
const GO_TO = /^(?:go\s*to|goto|->|=>|jump\s+to|then)\s+/iu;

export function parseAutomationStudioFlowScript(text: string): {
  script: AutomationStudioFlowScript;
  issues: AutomationStudioFlowBootstrapIssue[];
} {
  const issues: AutomationStudioFlowBootstrapIssue[] = [];
  const reader = new ScriptReader(issues);
  const lines = text.split(/\r?\n/u);
  if (lines.length > MAX_SCRIPT_LINES) {
    issues.push(authoringError("flow_script.too_many_lines", "The Flow script is longer than a Flow script may be.", "flow"));
    return { script: reader.script(), issues };
  }
  lines.forEach((raw, index) => reader.read(raw, index + 1));
  return { script: reader.script(), issues };
}

/** One pass over the lines, holding the block, step and value currently open. */
class ScriptReader {
  private summary: string[] | undefined;
  private readonly blocks: AutomationStudioFlowScriptBlock[] = [{ name: "Main", role: "primary", steps: [], line: 0 }];
  /** The block steps are appended to. `end` returns to the main sequence. */
  private current = 0;
  private open: string[] | undefined;

  constructor(private readonly issues: AutomationStudioFlowBootstrapIssue[]) {}

  script(): AutomationStudioFlowScript {
    return {
      ...(this.summary?.length ? { summary: joined(this.summary) } : {}),
      blocks: this.blocks.filter((block) => block.steps.length > 0)
    };
  }

  read(raw: string, line: number): void {
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("//")) return;
    if (authoringKey(trimmed) === "end") {
      this.current = 0;
      this.open = undefined;
      return;
    }
    const colon = trimmed.indexOf(":");
    if (colon < 0) return this.continueValue(trimmed, line);
    const head = trimmed.slice(0, colon).trim();
    const value = trimmed.slice(colon + 1).trim();
    const words = head.split(/\s+/u).filter(Boolean);
    const keyword = authoringKey(words[0] ?? "");
    const rest = words.slice(1).join(" ");
    if (BLOCK_WORDS.has(keyword)) return this.startBlock(rest, value, line);
    if (STEP_WORDS.has(keyword)) return this.startStep(rest, value, line);
    if (keyword === "on" && rest) return this.branch(rest, value, line);
    const step = this.currentStep();
    if (!step) {
      if (SUMMARY_WORDS.has(keyword) && !rest) return this.setSummary(value);
      if (ROLE_WORDS.has(keyword) && !rest) return this.setRole(value, line);
      return this.unrecognized(line);
    }
    if (NODE_WORDS.has(keyword) && !rest) {
      step.node = value;
      this.open = undefined;
      return;
    }
    const entry: AutomationStudioFlowScriptEntry = { key: head, lines: [value], line };
    step.entries.push(entry);
    this.open = entry.lines;
  }

  private setSummary(value: string): void {
    this.summary = [value];
    this.open = this.summary;
  }

  private setRole(value: string, line: number): void {
    const role = authoringKey(value);
    if (!SUBFLOW_ROLES.has(role)) return this.unrecognized(line);
    this.blocks[this.current]!.role = role as NonNullable<AutomationStudioFlowScriptBlock["role"]>;
  }

  private startBlock(label: string, name: string, line: number): void {
    const blockLabel = authoringLabel(label || name);
    this.blocks.push({
      ...(blockLabel ? { label: blockLabel } : {}),
      name: (name || label || `Block ${this.blocks.length}`).slice(0, 120),
      steps: [],
      line
    });
    this.current = this.blocks.length - 1;
    this.open = undefined;
  }

  private startStep(label: string, description: string, line: number): void {
    const runs = RUNS_BLOCK.exec(description);
    const step: AutomationStudioFlowScriptStep = {
      ...(label ? { label: authoringLabel(label) } : {}),
      description,
      ...(runs?.[1] ? { runsBlock: authoringLabel(runs[1]) } : {}),
      entries: [],
      branches: [],
      line
    };
    this.blocks[this.current]!.steps.push(step);
    this.open = undefined;
  }

  private branch(port: string, value: string, line: number): void {
    const step = this.currentStep();
    if (!step) return this.unrecognized(line);
    step.branches.push({ port, target: authoringLabel(value.replace(GO_TO, "")), line });
    this.open = undefined;
  }

  private continueValue(text: string, line: number): void {
    if (!this.open || joined(this.open).length + text.length + 1 > MAX_VALUE_LENGTH) return this.unrecognized(line);
    this.open.push(text);
  }

  private currentStep(): AutomationStudioFlowScriptStep | undefined {
    return this.blocks[this.current]?.steps.at(-1);
  }

  private unrecognized(line: number): void {
    this.issues.push({
      severity: "warning",
      code: "flow_script.unrecognized_line",
      message: "A line was not recognised and was left out; every other line was read.",
      path: `flow.line.${line}`
    });
  }
}

function joined(lines: string[]): string {
  return lines.join("\n").trim();
}
