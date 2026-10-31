// Optional and handler steps declaring no lasting consequences must not take
// an interruption's offer. The host's validated, per-node resolution supplies
// this contextual meaning; neither the control's display words nor authored
// dialog facts can supply it. A response-only acceptance answers the
// interruption itself. That annotation grants no permission or effect safety:
// an explicitly lasting declaration still goes through the actual gate.
import type { JsonObject } from "../../../../../core/index.ts";
import type {
  AutomationStudioFlowBootstrapIssueLocator,
  AutomationStudioFlowScript,
  AutomationStudioFlowScriptStep
} from "../authoring/index.ts";
import { automationStudioModelFacingControlWords } from "../../llm/model-facing/index.ts";
import { automationStudioResolvedControlIntentFor, type AutomationStudioResolvedControlIntent } from "../../llm/resolved-control-intent/index.ts";
import type { AutomationStudioFlowBootstrapIssue, AutomationStudioFlowBootstrapPlan } from "../plan/index.ts";
import { automationStudioFlowScriptStepSaysOptional } from "./guarded-steps.ts";
import { scriptStatementRefusal } from "./statement-refusal.ts";

const WAY_OUT_ACCEPTS = "flow_script.way_out_accepts";
/** Display only: missing or longer words never hide a known acceptance. */
const MAX_CONTROL_WORDS = 80;
type Dismissal = { step: AutomationStudioFlowScriptStep; why: "optional" | "handler"; handlerLine?: number };

/** Diagnose the resolved node before any candidate relayout or transformation. */
export function automationStudioFlowScriptWayOutIssues(input: {
  script: AutomationStudioFlowScript;
  plan: AutomationStudioFlowBootstrapPlan;
  locator: AutomationStudioFlowBootstrapIssueLocator | undefined;
  controlIntents?: ReadonlyMap<string, AutomationStudioResolvedControlIntent> | undefined;
}): AutomationStudioFlowBootstrapIssue[] {
  const dismissals = new Map<number, Dismissal>();
  for (const block of input.script.blocks) {
    for (const step of block.steps) {
      if (step.line <= 0) continue;
      if (block.handler) dismissals.set(step.line, { step, why: "handler", handlerLine: block.handler.line });
      else if (automationStudioFlowScriptStepSaysOptional(step)) dismissals.set(step.line, { step, why: "optional" });
    }
  }
  if (!dismissals.size || !input.locator) return [];
  const issues: AutomationStudioFlowBootstrapIssue[] = [];
  const refused = new Set<number>();
  for (const [subflowIndex, subflow] of input.plan.subflows.entries()) {
    for (const [nodeIndex, node] of subflow.nodes.entries()) {
      // Explicitly empty only. Lasting declarations are the permission gate's.
      if (!Array.isArray(node.consequences) || node.consequences.length) continue;
      const line = input.locator.nodes[`${subflowIndex}.${nodeIndex}`]?.line;
      const dismissal = line === undefined ? undefined : dismissals.get(line);
      if (!dismissal || refused.has(dismissal.step.line)) continue;
      const intent = automationStudioResolvedControlIntentFor(input.controlIntents, subflow.key, node.key);
      if (intent?.intent !== "accept" || intent.responseOnly === true) continue;
      refused.add(dismissal.step.line);
      issues.push(scriptStatementRefusal(WAY_OUT_ACCEPTS, message(dismissal, boundedControlWords(node.parameters)), consequencesLine(dismissal.step)));
    }
  }
  return issues;
}

function boundedControlWords(parameters: JsonObject | undefined): string | undefined {
  const words = automationStudioModelFacingControlWords(parameters);
  return words && words.length <= MAX_CONTROL_WORDS ? words : undefined;
}

function consequencesLine(step: AutomationStudioFlowScriptStep): number {
  return step.entries.find((entry) => /^consequences?$/iu.test(entry.key.trim()))?.line ?? step.line;
}

function message(dismissal: Dismissal, words: string | undefined): string {
  const where = dismissal.why === "optional"
    ? `The step at line ${dismissal.step.line} is optional, so it answers an interruption`
    : `The step at line ${dismissal.step.line} is in the handler at line ${dismissal.handlerLine}, so it answers an interruption`;
  const control = words ? `the control ${JSON.stringify(words)}` : "a control";
  return `${where}, and the client identified ${control} as accepting what it offers while the step says \`consequences: none\`. `
    + "Use a control that dismisses or answers the interruption itself. If the instruction asks for the offered act, make it a step of its own and declare what it lastingly does on its `consequences:` line; the permission check still applies.";
}
