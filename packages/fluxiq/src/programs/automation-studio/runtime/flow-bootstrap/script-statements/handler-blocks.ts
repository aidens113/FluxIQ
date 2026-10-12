// A handler: steps the run takes when something it can recognise gets in the
// way, and what it does after (t388, contract C3, C4, C5, C12).
//
//   on retry for open: a "slow down" notice covers the list     event and scope
//     when: dialog alertdialog "Slow down"                       the facts that call for it
//     step: close the notice                                     its body
//       node: web.dom.click
//       target: t30
//       consequences: none
//     then: carry on                                             what happens after
//   end
//
// It is lowered into the shape the contract stores (C4): a registration node,
// `builtin.control.handler`, whose `body` port leads through the handler's own
// steps to `builtin.control.handler-end`, which carries the disposition. The
// registration and its body sit in the graph of the block the handler is
// written in, apart from that block's own steps; a handler written
// `everywhere` sits in the Flow's recovery Subflow instead.
//
//   event   `before`, `retry`, `fail`, `start`, or `next` (C3's `before_next`)
//   scope   `for <step labels>` -> those steps; none or `for this part` -> the
//           block it is written in; `everywhere` -> the whole Flow
//   then    `carry on` -> resume, `go to <checkpoint step>` -> route,
//           `use <name> = <value>, ...` -> resolve, `give up` -> unhandled
//
// A `before` or `retry` handler must prove it worked (C4's `completionCheck`):
// its `done when:` lines, or else the opposite of each `when:` fact -- a notice
// that was showing is gone -- where every one has an opposite. Refused, each at
// its line: a scope naming no step of the block, a step scope on `start`, no
// `then:` or one that cannot be read, `carry on` after a failure (there is no
// success to carry on from), `use` anywhere but after a failure, `go to` a step
// that is not a checkpoint, and a `before` or `retry` handler with no check.
import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioFlowBootstrapFactCondition, AutomationStudioFlowBootstrapIssue } from "../plan/index.ts";
import { AUTOMATION_STUDIO_FLOW_BOOTSTRAP_STATE_NODE_IDS } from "../plan/index.ts";
import { automationStudioDispositionAllowedAt, type AutomationStudioLifecycleEvent } from "../../../nodes/control-flow/index.ts";
import type { AutomationStudioFlowScriptBlock, AutomationStudioFlowScriptEntry, AutomationStudioFlowScriptStep } from "../authoring/index.ts";
import { automationStudioFlowScriptFactGone, automationStudioFlowScriptFacts } from "./fact-condition.ts";
import { scriptStatementRefusal } from "./statement-refusal.ts";

/** The event each `on <event>` word registers for (C3). */
const EVENTS: Readonly<Record<string, AutomationStudioLifecycleEvent>> = { before: "before", retry: "retry", fail: "fail", start: "start", next: "before_next" };
const HERE = new Set(["for this part", "for this block", "for this subflow", "here"]);
const EVERYWHERE = new Set(["everywhere", "anywhere", "for everything", "for the whole flow"]);
const RESUME = /^(?:carry\s+on|continue|resume)\b/iu;
const ROUTE = /^(?:go\s*to|goto)\s+(.+)$/iu;
const RESOLVE = /^use\s+(.+)$/iu;
const UNHANDLED = /^(?:give\s+up|stop|fail)\b/iu;
const OUTPUT_PAIR = /^([A-Za-z][A-Za-z0-9_]*)\s*[=:]\s*(\S[\s\S]*)$/u;

/**
 * One handler block as the steps it becomes -- its registration, its own steps,
 * and its end -- or no steps and the issues that refused it. `steps` of the
 * block are already lowered (`./guarded-steps.ts`, `../authoring/draft-routing.ts`).
 */
export function automationStudioFlowScriptHandlerSteps(input: {
  block: AutomationStudioFlowScriptBlock;
  /** Its place among the handlers of the graph it registers in, from 1, in the order written: the Flow's recovery Subflow's when `automation`. */
  orderIn(automation: boolean): number;
  /** Whether the library offers the handler and handler-end nodes. */
  available: boolean;
  /** The node key a label has in the block the handler is written in, if it labels a step there. */
  keyOf(label: string): string | undefined;
  /** Whether a label names a step of another block. */
  elsewhere(label: string): boolean;
  /** The checkpoint id of the step a label names, if it is a checkpoint. */
  checkpointOf(label: string): string | undefined;
}): { steps: AutomationStudioFlowScriptStep[]; automation: boolean; issues: AutomationStudioFlowBootstrapIssue[]; facts: boolean } {
  const handler = input.block.handler!;
  const issues: AutomationStudioFlowBootstrapIssue[] = [];
  const at = `The handler at line ${handler.line}`;
  const refused = (code: string, message: string, line: number) => {
    issues.push(scriptStatementRefusal(code, message, line));
    return { steps: [], automation: false, issues, facts: false };
  };
  if (!input.available) {
    return refused("flow_script.handler_unavailable", `${at} needs "${AUTOMATION_STUDIO_FLOW_BOOTSTRAP_STATE_NODE_IDS.handler}" and "${AUTOMATION_STUDIO_FLOW_BOOTSTRAP_STATE_NODE_IDS.handlerEnd}", and this library does not offer them.`, handler.line);
  }
  const scope = readScope(handler.scope.toLowerCase().replace(/\s+/gu, " ").trim());
  if (!scope) {
    return refused("flow_script.handler_invalid", `${at} says "on ${handler.event} ${handler.scope.slice(0, 60)}". Say where it applies after the event: \`for <step label>\` (several with commas), \`for this part\`, or \`everywhere\`; with none it applies to the block it is written in.`, handler.line);
  }
  if (scope.kind !== "automation" && handler.parent === undefined) {
    return refused("flow_script.handler_invalid", `${at} is written where no block has a step, so "for this part" names nothing. Write it inside the block whose steps it covers, or say \`everywhere\`.`, handler.line);
  }
  let nodeIds: string[] | undefined;
  if (scope.kind === "nodes") {
    if (handler.event === "start") return refused("flow_script.handler_invalid", `${at} is \`on start\` for steps. A part starts once, before any of its steps, so \`on start\` applies to the part: write \`on start:\` or \`on start for this part:\`.`, handler.line);
    nodeIds = [];
    for (const label of scope.labels) {
      const key = input.keyOf(label);
      if (key === undefined) {
        return refused("flow_script.handler_invalid", input.elsewhere(label)
          ? `${at} is for "${label.slice(0, 60)}", a step of another block. A handler for steps is written inside their block.`
          : `${at} is for "${label.slice(0, 60)}", which labels no step of the block it is written in.`, handler.line);
      }
      nodeIds.push(key);
    }
  }
  const then = handler.then;
  if (!then) {
    return refused("flow_script.handler_then_invalid", `${at} does not say what happens after its steps. End it with \`then: carry on\`, \`then: go to <checkpoint step>\`, \`then: use <output> = <value>\` or \`then: give up\`, then \`end\`.`, handler.line);
  }
  const disposition = readDisposition(then.text);
  const thenAt = `The \`then:\` at line ${then.line}`;
  if (!disposition) return refused("flow_script.handler_then_invalid", `${thenAt} says ${JSON.stringify(then.text.slice(0, 60))}. Write \`carry on\`, \`go to <checkpoint step>\`, \`use <output> = <value>\` or \`give up\`.`, then.line);
  // The static half of C5's table is the handler-end node's own (`nodes/control-flow/handler-end.ts`).
  const allowed = automationStudioDispositionAllowedAt(EVENTS[handler.event]!, disposition.kind);
  if (!allowed && disposition.kind === "resume") {
    return refused("flow_script.handler_then_invalid", `${thenAt} says carry on after a failure, but the step failed, so there is nothing to carry on from. After a failure, \`go to\` a checkpoint step, \`use\` the values the step should have given, or \`give up\`.`, then.line);
  }
  if (!allowed) {
    return refused("flow_script.handler_then_invalid", `${thenAt} says use, which stands in for a step's results after it failed; this handler is \`on ${handler.event}\`. Use \`carry on\` or \`go to <checkpoint step>\` here.`, then.line);
  }
  const parameters: JsonObject = { disposition: disposition.kind };
  if (disposition.kind === "route") {
    const checkpointId = input.checkpointOf(disposition.label);
    if (checkpointId === undefined) {
      return refused("flow_script.handler_then_invalid", `${thenAt} goes to "${disposition.label.slice(0, 60)}", which is not a step marked \`checkpoint: yes\`. A handler brings the run back only to a checkpoint: mark that step, or name one that is.`, then.line);
    }
    parameters.checkpointId = checkpointId;
  }
  const entries: AutomationStudioFlowScriptEntry[] = [];
  if (disposition.kind === "resolve") {
    parameters.outputs = {};
    for (const pair of disposition.pairs) {
      const written = OUTPUT_PAIR.exec(pair);
      if (!written) return refused("flow_script.handler_then_invalid", `${thenAt} uses ${JSON.stringify(pair.slice(0, 60))}. Name each value the failed step should have given and what stands in for it: \`use <output> = $step.<label>.<output>\`, comma separated.`, then.line);
      entries.push({ key: `outputs.${written[1]}`, lines: [written[2]!.trim()], line: then.line });
    }
  }
  const when = automationStudioFlowScriptFacts(input.block.when ?? [], issues);
  const done = automationStudioFlowScriptFacts(input.block.done ?? [], issues);
  if (!when || !done) return { steps: [], automation: false, issues, facts: false };
  let completionCheck = done;
  if (!completionCheck.length && (handler.event === "before" || handler.event === "retry")) {
    const opposite = when.map(automationStudioFlowScriptFactGone);
    if (!when.length || opposite.some((fact) => fact === undefined)) {
      return refused("flow_script.handler_check_missing", `${at} is \`on ${handler.event}\`, so it must say how the run knows its steps worked. Add a \`done when:\` line with what the page shows once they did: \`done when: absent t30\`.`, handler.line);
    }
    completionCheck = opposite as AutomationStudioFlowBootstrapFactCondition[];
  }
  const registration: AutomationStudioFlowScriptStep = {
    label: `${input.block.label}.register`,
    description: handler.situation || input.block.name,
    node: AUTOMATION_STUDIO_FLOW_BOOTSTRAP_STATE_NODE_IDS.handler,
    entries: [],
    branches: [],
    derivedParameters: {
      event: EVENTS[handler.event]!,
      scope: scope.kind === "nodes" ? { kind: "nodes", nodeIds: nodeIds! } : scope.kind === "subflow" ? { kind: "subflow", inherit: true } : { kind: "automation" },
      when,
      order: input.orderIn(scope.kind === "automation"),
      completionCheck
    },
    // The situation it handles, in the words written for it, which the editor
    // and the chat name the handler by (t398); never page data.
    nodeLabel: situationLabel(handler.situation || input.block.name),
    line: 0,
    cause: handler.line
  };
  const end: AutomationStudioFlowScriptStep = {
    label: `${input.block.label}.end`,
    description: `then ${then.text}`.slice(0, 200),
    nodeLabel: situationLabel(`Then ${then.text}`),
    node: AUTOMATION_STUDIO_FLOW_BOOTSTRAP_STATE_NODE_IDS.handlerEnd,
    entries,
    branches: [],
    derivedParameters: parameters,
    line: 0,
    cause: then.line
  };
  const facts = when.length > 0 || completionCheck.length > 0;
  return { steps: [registration, ...input.block.steps, end], automation: scope.kind === "automation", issues, facts };
}

/** Written words as a node's name: one line, bounded as a block's name is. */
function situationLabel(text: string): string {
  return text.replace(/\s+/gu, " ").trim().slice(0, 120);
}

type Scope = { kind: "subflow" } | { kind: "automation" } | { kind: "nodes"; labels: string[] };

function readScope(words: string): Scope | undefined {
  if (!words || HERE.has(words)) return { kind: "subflow" };
  if (EVERYWHERE.has(words)) return { kind: "automation" };
  const named = /^for\s+(.+)$/u.exec(words);
  if (!named) return undefined;
  const labels = named[1]!.split(/\s*,\s*|\s+and\s+/u).map((label) => label.trim()).filter(Boolean);
  return labels.length ? { kind: "nodes", labels } : undefined;
}

type Disposition =
  | { kind: "resume" }
  | { kind: "route"; label: string }
  | { kind: "resolve"; pairs: string[] }
  | { kind: "unhandled" };

function readDisposition(text: string): Disposition | undefined {
  const written = text.trim();
  if (RESUME.test(written)) return { kind: "resume" };
  const route = ROUTE.exec(written);
  if (route) return { kind: "route", label: route[1]!.trim().toLowerCase().replace(/\s+/gu, " ") };
  const resolve = RESOLVE.exec(written);
  if (resolve) return { kind: "resolve", pairs: resolve[1]!.split(",").map((pair) => pair.trim()).filter(Boolean) };
  if (UNHANDLED.test(written)) return { kind: "unhandled" };
  return undefined;
}
