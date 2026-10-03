// `core.run_flow`: the model's way to run part of the Flow again, and the loop
// binding that offers and answers it (t244).
//
// The user's rule (2026-10-02): the build and repair loops can run the Flow
// from a chosen step to test part of it; it never replaces the whole-Flow test.
// What it runs and where it stops is `./run-flow-part.ts`. This is the tool the
// model is shown, and when it is shown:
//
// - **Only where the loop drafts and runs its dry run.** A loop with no draft
//   has no Flow to run, and a loop whose caller turned the dry run off cannot
//   run a step again (`../loop-configuration.ts`, `dryRun`).
// - **Only while the draft holds a proposed step that can run again**: one
//   with what it ran with and how to run it again. Before that, and in a draft
//   carried whole from an earlier Flow, there is nothing it could run.
// - **Only where the caller's own tools can act.** A loop offered nothing that
//   changes anything -- a repair's exploration -- is one where nothing can
//   mutate, and the loop's repeat rules and its configuration check both read
//   that from the tools it offers (`../repeat-policy.ts`). Core's tool must not
//   quietly turn such a loop into one that can.
// - **Never in place of a tool the loop was given under the same id.**
//
// It is Core's: the Flow's steps are Core's draft, whatever domain runs them,
// so its words name the target, never a page.

import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import { automationStudioFlowDraftStepIsProposed, type AutomationStudioFlowDraftStep } from "../../flow-draft/index.ts";
import type { AutomationStudioLlmEvidenceTool, AutomationStudioLlmEvidenceToolExecutionResult } from "../evidence-loop.ts";
import { runAutomationStudioFlowDraftPart } from "./run-flow-part.ts";

/** The tool that runs part of the Flow. */
export const AUTOMATION_STUDIO_LLM_RUN_FLOW_TOOL_ID = "core.run_flow";

/** The most tools a loop may offer (`../evidence-loop-decision.ts`); the tool is not added past it. */
const MAX_TOOLS = 32;

const DESCRIPTION = [
  "Run the Flow's own steps again, from step `from` to step `to` (or to its last step), numbered as the draft shows them,",
  "on the target as it stands now: nothing is reset first.",
  "Each step runs with exactly the arguments the Flow runs it with, and no model is attached; a step whose effect lasts is checked, not repeated.",
  "A step the Flow does not always run may not pass without stopping the run; any other step that does not pass stops it there, and the target is left where it stopped.",
  "Use it to test a part you repaired without running everything.",
  "It is never the Flow's test: the Flow is finished only once it has run whole from its start and been judged, and any change after that needs another whole run."
].join(" ");

/** `core.run_flow` as the loop offers it: a fresh copy each time, so no loop can change what the next one offers. */
export function automationStudioLlmRunFlowTool(): AutomationStudioLlmEvidenceTool {
  return {
    toolId: AUTOMATION_STUDIO_LLM_RUN_FLOW_TOOL_ID,
    description: DESCRIPTION,
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["from"],
      properties: {
        from: { type: "integer", minimum: 1, description: "The number of the first step to run, as the draft shows it." },
        to: { type: "integer", minimum: 1, description: "The number of the last step to run; the Flow's last step when absent." }
      }
    },
    effect: "mutate"
  };
}

type RunFlowLoop = {
  tools: AutomationStudioLlmEvidenceTool[];
  executeTool(input: { callId: string; toolId: string; value: JsonObject; signal?: AbortSignal }): Promise<JsonValue | AutomationStudioLlmEvidenceToolExecutionResult>;
  /** The loop's own draft, read at each call: the steps it runs are the draft as it stands then. */
  steps: readonly AutomationStudioFlowDraftStep[];
  /** Whether the loop drafts and runs its dry run. */
  enabled: boolean;
  /** The build's lasting acts, read when a part run first needs them, as the dry run reads them (`./dry-run-gate.ts`). */
  lastingActs?: (() => Promise<ReadonlySet<string>>) | undefined;
};

/**
 * The loop's tools with `core.run_flow` after them, when it may be offered;
 * an executor that answers it by running the draft's steps through the loop's
 * own executor and passes every other call on; and whether a tool may be
 * offered to the next decision.
 */
export function automationStudioLlmRunFlowBinding(loop: RunFlowLoop): {
  tools: AutomationStudioLlmEvidenceTool[];
  executeTool: RunFlowLoop["executeTool"];
  offered(tool: AutomationStudioLlmEvidenceTool): boolean;
} {
  const { tools, steps } = loop;
  const adds = loop.enabled && Array.isArray(tools) && tools.length > 0 && tools.length < MAX_TOOLS
    && tools.some((tool) => tool.effect === "mutate" || tool.perCallEffect === true)
    && !tools.some((tool) => tool.toolId === AUTOMATION_STUDIO_LLM_RUN_FLOW_TOOL_ID);
  const executeTool = loop.executeTool;
  return {
    tools: adds ? [...tools, automationStudioLlmRunFlowTool()] : tools,
    executeTool: adds
      ? async (input) => input.toolId === AUTOMATION_STUDIO_LLM_RUN_FLOW_TOOL_ID
        ? runAutomationStudioFlowDraftPart({ steps, value: input.value, callId: input.callId, executeTool, signal: input.signal, ...(loop.lastingActs ? { lastingActs: await loop.lastingActs() } : {}) })
        : executeTool(input)
      : executeTool,
    offered: (tool) => !adds || tool.toolId !== AUTOMATION_STUDIO_LLM_RUN_FLOW_TOOL_ID
      || steps.some((step) => automationStudioFlowDraftStepIsProposed(step) && step.ranWith !== undefined && step.replay !== undefined)
  };
}
