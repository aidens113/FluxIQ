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
//
// A step's `repeat over:`, `repeat through:`, `repeat while:`, `repeat most:`
// and `repeat pace:` lines are read onto the step as written (t346, t378);
// whether they make a loop, and which, is `./draft-routing.ts`'s question. Its
// `optional:` and `only after:` lines are read the same way (t357, t378); what
// they mean is `../script-statements/guarded-steps.ts`'s.
//
// The state-aware statements (t388, contract C12) are read the same way, as
// written, and lowered elsewhere (`../script-statements/`):
//
//   part <label>: <name>            a block a step calls (`subflow` and `block` work too)
//   input: <name>                   one value the part is given, by name
//   output: <name> = <binding>      one value the part hands back
//   call: <part>                    on a step: run that part and wait for it
//   start at: <step>  + when: ...   another step the block may start at
//   checkpoint: yes                 on a step: a handler may bring the run back here
//   done when: <fact>               what proves the block, or the handler, worked
//   on <event> [for ...]: <words>   a handler, with its `when:` lines, its steps,
//     ... then: <what next>         its `then:` line and its own `end`
//
// A handler is a block inside the block it is written in: its `end` returns
// there, not to the main sequence. `when:` lines belong to the handler, to the
// `start at:` above them, or else to the block, in that order.
import type { AutomationStudioFlowBootstrapIssue } from "../plan/index.ts";
import type {
  AutomationStudioFlowScript,
  AutomationStudioFlowScriptBlock,
  AutomationStudioFlowScriptCondition,
  AutomationStudioFlowScriptEntry,
  AutomationStudioFlowScriptEntryPoint,
  AutomationStudioFlowScriptHandler,
  AutomationStudioFlowScriptRepeat,
  AutomationStudioFlowScriptStep
} from "./contracts.ts";
import { authoringError } from "./issue.ts";
import { authoringKey, authoringLabel } from "./keys.ts";

/** The most lines one script may hold, so a runaway reply is bounded before it is read. */
const MAX_SCRIPT_LINES = 2_000;
/** The most characters one value may reach across its continuation lines. */
const MAX_VALUE_LENGTH = 4_000;

const STEP_WORDS = new Set(["step", "action", "task", "then"]);
const BLOCK_WORDS = new Set(["subflow", "block", "part"]);
const SUMMARY_WORDS = new Set(["flow", "summary", "goal", "title", "purpose"]);
const NODE_WORDS = new Set(["node", "use", "uses", "definition", "definitionid", "nodeid"]);
const ROLE_WORDS = new Set(["role", "kind"]);
/** A line that says when the block it sits in runs. Read wherever it appears in the block. */
const WHEN_WORDS = new Set(["when", "runwhen", "onlywhen", "routewhen"]);
const UNLESS_WORDS = new Set(["unless"]);
const SUBFLOW_ROLES = new Set(["primary", "integration", "recovery", "fallback", "utility"]);
const RUNS_BLOCK = /^(?:run|call|enter)\s+(?:the\s+)?(?:subflow|block)\s+(.+)$/iu;
const GO_TO = /^(?:go\s*to|goto|->|=>|jump\s+to|then)\s+/iu;
/**
 * A step's `repeat over:`, `repeat through:`, `repeat while:` and `repeat
 * most:` lines (`AutomationStudioFlowScriptRepeat`). Two words, so no node
 * parameter is ever read as one: a key with a space in it names none.
 */
const REPEAT_WORD = "repeat";
const REPEAT_PARTS = new Set(["over", "through", "while", "most", "pace"]);
/**
 * A step's `optional:` line (`AutomationStudioFlowScriptOptional`): the step is
 * only sometimes needed. Reserved, as `node:` is, so it is never read as a node
 * parameter; no node declares a parameter by either name.
 */
const OPTIONAL_WORDS = new Set(["optional", "sometimespresent"]);
/**
 * A step's `only after: <label>` line (`AutomationStudioFlowScriptOnlyAfter`):
 * the step runs only when the optional step it names was done. Two words, so,
 * as a repeat line's, it can never be a node parameter's name.
 */
const ONLY_AFTER_WORDS = new Set(["onlyafter"]);
/** A step's `call: <part>` line. Reserved, as `node:` is; no node declares a parameter by these names. */
const CALL_WORDS = new Set(["call", "callpart", "runpart"]);
/** A step's `checkpoint:` line. */
const CHECKPOINT_WORDS = new Set(["checkpoint"]);
/** A block's `start at: <step>` line. Two words, so never a parameter's name. */
const START_AT_WORDS = new Set(["startat"]);
/** A block's `done when:` line: what proves it, or the handler, worked. */
const DONE_WORDS = new Set(["donewhen", "successwhen", "succeedswhen"]);
/** A part's `input: <name>` line. */
const INPUT_WORDS = new Set(["input"]);
/** A part's `output: <name> = <binding>` line; an `output:` with no `=` is a step's output action, as before. */
const OUTPUT_WORD = "output";
const PART_OUTPUT = /^([A-Za-z][A-Za-z0-9_]*)\s*=\s*(\S[\s\S]*)$/u;
/** The events a handler's `on <event>` line names (C3: `next` is before the next step). */
const HANDLER_EVENTS = new Set(["before", "retry", "fail", "start", "next"]);
/** A `then:` line in a handler's block that says what happens next, rather than starting a step. */
const DISPOSITION = /^(?:carry\s+on|continue|resume|go\s*to|goto|use|give\s+up|stop|fail)\b/iu;

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
  /** The `start at:` the next `when:` lines belong to, until a step, block or `end` starts. */
  private entry: AutomationStudioFlowScriptEntryPoint | undefined;
  private handlers = 0;

  constructor(private readonly issues: AutomationStudioFlowBootstrapIssue[]) {}

  script(): AutomationStudioFlowScript {
    // A block with no step is dropped, as before, except a handler's, whose
    // `then:` alone may be all it does. A handler's parent is renumbered to the
    // blocks kept.
    const kept = this.blocks.filter((block) => block.steps.length > 0 || block.handler);
    const index = new Map(kept.map((block, at) => [block, at]));
    const blocks = kept.map((block) => {
      if (!block.handler) return block;
      const parent = block.handler.parent === undefined ? undefined : index.get(this.blocks[block.handler.parent]!);
      const handler: AutomationStudioFlowScriptHandler = { ...block.handler };
      delete handler.parent;
      return { ...block, handler: parent === undefined ? handler : { ...handler, parent } };
    });
    return {
      ...(this.summary?.length ? { summary: joined(this.summary) } : {}),
      blocks
    };
  }

  read(raw: string, line: number): void {
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("//")) return;
    if (authoringKey(trimmed) === "end") {
      // A handler's `end` returns to the block it was written in.
      this.current = this.blocks[this.current]?.handler?.parent ?? 0;
      this.open = undefined;
      this.entry = undefined;
      return;
    }
    const colon = trimmed.indexOf(":");
    if (colon < 0) return this.continueValue(trimmed, line);
    const head = trimmed.slice(0, colon).trim();
    const value = trimmed.slice(colon + 1).trim();
    const words = head.split(/\s+/u).filter(Boolean);
    const keyword = authoringKey(words[0] ?? "");
    const rest = words.slice(1).join(" ");
    const key = authoringKey(head);
    if (BLOCK_WORDS.has(keyword)) return this.startBlock(rest, value, line);
    if (keyword === "then" && !rest && this.blocks[this.current]?.handler && DISPOSITION.test(value)) return this.setThen(value, line);
    if (STEP_WORDS.has(keyword)) return this.startStep(rest, value, line);
    if (WHEN_WORDS.has(key) || UNLESS_WORDS.has(key)) return this.addCondition(value, UNLESS_WORDS.has(key), line);
    if (DONE_WORDS.has(key)) return this.addDone(value, line);
    if (keyword === "on" && rest) {
      const event = authoringKey(words[1] ?? "");
      if (HANDLER_EVENTS.has(event) && !GO_TO.test(value)) return this.startHandler(event as AutomationStudioFlowScriptHandler["event"], words.slice(2).join(" "), value, line);
      return this.branch(rest, value, line);
    }
    if (START_AT_WORDS.has(key)) return this.startAt(value, line);
    if (INPUT_WORDS.has(key)) return this.addInput(value, line);
    const output = keyword === OUTPUT_WORD && !rest ? PART_OUTPUT.exec(value) : null;
    if (output) return this.addOutput(output[1]!, output[2]!, line);
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
    if (keyword === REPEAT_WORD && REPEAT_PARTS.has(authoringKey(rest))) return this.repeat(step, authoringKey(rest), value, line);
    if (OPTIONAL_WORDS.has(authoringKey(head))) {
      step.optional = { text: value, line };
      this.open = undefined;
      return;
    }
    if (ONLY_AFTER_WORDS.has(authoringKey(head))) {
      step.onlyAfter = { label: authoringLabel(value), line };
      this.open = undefined;
      return;
    }
    if (CALL_WORDS.has(key)) {
      step.calls = { label: authoringLabel(value), line };
      this.open = undefined;
      return;
    }
    if (CHECKPOINT_WORDS.has(key)) {
      step.checkpoint = { text: value, line };
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

  private addCondition(text: string, negate: boolean, line: number): void {
    const condition: AutomationStudioFlowScriptCondition = { text, ...(negate ? { negate: true as const } : {}), line };
    const block = this.blocks[this.current]!;
    if (this.entry && !block.handler) this.entry.when.push(condition);
    else (block.when ??= []).push(condition);
    this.open = undefined;
  }

  private addDone(text: string, line: number): void {
    (this.blocks[this.current]!.done ??= []).push({ text, line });
    this.open = undefined;
  }

  private startAt(value: string, line: number): void {
    const entry: AutomationStudioFlowScriptEntryPoint = { step: authoringLabel(value), when: [], line };
    (this.blocks[this.current]!.entries ??= []).push(entry);
    this.entry = entry;
    this.open = undefined;
  }

  private addInput(value: string, line: number): void {
    (this.blocks[this.current]!.inputs ??= []).push({ label: value.trim(), line });
    this.open = undefined;
  }

  private addOutput(name: string, binding: string, line: number): void {
    (this.blocks[this.current]!.outputs ??= []).push({ name, binding: binding.trim(), line });
    this.open = undefined;
  }

  private startHandler(event: AutomationStudioFlowScriptHandler["event"], scope: string, situation: string, line: number): void {
    // A handler is written inside a block and ends back in it; one written
    // inside another handler without that one's `end` belongs to the same block.
    const here = this.blocks[this.current]!;
    const parent = here.handler ? here.handler.parent : this.current;
    this.handlers += 1;
    this.blocks.push({
      label: `:on${this.handlers}`,
      name: (situation || `on ${event}`).slice(0, 120),
      handler: { event, scope: scope.trim(), situation, ...(parent === undefined ? {} : { parent }), line },
      steps: [],
      line
    });
    this.current = this.blocks.length - 1;
    this.open = undefined;
    this.entry = undefined;
  }

  private setThen(value: string, line: number): void {
    this.blocks[this.current]!.handler!.then = { text: value, line };
    this.open = undefined;
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
    this.entry = undefined;
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
    this.entry = undefined;
  }

  private branch(port: string, value: string, line: number): void {
    const step = this.currentStep();
    if (!step) return this.unrecognized(line);
    step.branches.push({ port, target: authoringLabel(value.replace(GO_TO, "")), line });
    this.open = undefined;
  }

  private repeat(step: AutomationStudioFlowScriptStep, part: string, value: string, line: number): void {
    const repeat: AutomationStudioFlowScriptRepeat = step.repeat ?? { line };
    if (part === "most") {
      repeat.most = value;
      repeat.mostLine = line;
    } else if (part === "pace") {
      repeat.pace = value;
      repeat.paceLine = line;
    } else if (part === "over") repeat.over = authoringLabel(value);
    else if (part === "through") repeat.through = authoringLabel(value);
    else repeat.while = authoringLabel(value);
    step.repeat = repeat;
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
