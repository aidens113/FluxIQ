// Where the target stands against where the build began (t462).
//
// The start is read once, through the bound domain's `startState`, right after
// the loop's opening call took the target to the build's start (`initial.*`),
// or before the first later call when there was no such call: before anything
// this build does can have changed it. It is asked once, and only once; a
// start that could not be read is not read later, when acts may already be on
// the site.
//
// Before a trial that follows a lasting act, `compare` takes the target back
// to the start through the run-node tool's own arrival, run by the loop's inner
// executor as any call is, and asks `startState` again with the start it kept.
// Its `differs` is what is not as it was, in the domain's words. When there is
// no start, no arrival or no `startState`, or any of it fails, `differs` is
// absent and the ledger alone decides (`./trial-policy.ts`). Core reads no
// state here: `state` stays opaque, kept only to hand back.

import type { JsonObject } from "../../../../../core/index.ts";
import { automationStudioActionPermissionDenied } from "../../action-permissions/index.ts";
import { AUTOMATION_STUDIO_LLM_RUN_NODE_TOOL_ID, type AutomationStudioLlmEvidenceRuntimeBinding, type AutomationStudioLlmEvidenceTool } from "../../llm/index.ts";
import type { AutomationStudioSiteResetComparison } from "./contracts.ts";

type Execute = (call: { callId: string; toolId: string; value: JsonObject; signal?: AbortSignal }) => Promise<unknown>;

export class AutomationStudioSiteResetStartCheck {
  private attempted = false;
  private start: JsonObject | undefined;
  private checks = 0;
  /** Why the last read or comparison could not be made, kept for a reader rather than dropped. */
  private lastFailure: unknown;

  constructor(private readonly input: {
    binding: Pick<AutomationStudioLlmEvidenceRuntimeBinding, "startState"> | undefined;
    projectId: string;
    flowId: string;
    tools: readonly AutomationStudioLlmEvidenceTool[];
    executeTool: Execute;
  }) {}

  /** Whether the start was read. */
  get taken(): boolean { return this.start !== undefined; }

  /** Why the last read or comparison failed, if one did. */
  get failure(): unknown { return this.lastFailure; }

  /** Reads the start, the first time only. */
  async capture(signal?: AbortSignal): Promise<void> {
    if (this.attempted) return;
    this.attempted = true;
    const startState = this.input.binding?.startState;
    if (!startState) return;
    try {
      const read = await startState.call(this.input.binding, { projectId: this.input.projectId, flowId: this.input.flowId, callId: "site-reset.start", permission: automationStudioActionPermissionDenied, ...(signal ? { signal } : {}) });
      if (stateAnswer(read)) this.start = structuredClone(read.state);
    } catch (error) {
      if (signal?.aborted) throw error;
      this.lastFailure = error;
    }
  }

  /** Takes the target back to the start and says what still differs; `differs` is absent when that cannot be said. */
  async compare(signal?: AbortSignal): Promise<AutomationStudioSiteResetComparison> {
    const startState = this.input.binding?.startState;
    const tool = this.input.tools.find((entry) => entry.toolId === AUTOMATION_STUDIO_LLM_RUN_NODE_TOOL_ID);
    const arrival = tool?.initialObservation?.arrival;
    if (!startState || !this.start || !tool || !arrival) return { moved: false };
    this.checks += 1;
    const n = this.checks;
    let moved = false;
    try {
      const ran = await this.input.executeTool({ callId: `site-reset.${n}.arrival`, toolId: tool.toolId, value: structuredClone(arrival), ...(signal ? { signal } : {}) });
      moved = isExecution(ran) && ran.effectApplied === true;
      if (!landed(ran)) return { moved };
      const read = await startState.call(this.input.binding, { projectId: this.input.projectId, flowId: this.input.flowId, callId: `site-reset.${n}.start`, start: structuredClone(this.start), permission: automationStudioActionPermissionDenied, ...(signal ? { signal } : {}) });
      return stateAnswer(read) ? { moved, differs: [...read.differs] } : { moved };
    } catch (error) {
      if (signal?.aborted) throw error;
      this.lastFailure = error;
      return { moved };
    }
  }
}

type Execution = { kind: "llm_evidence_tool_execution"; effectApplied?: unknown; evidence?: unknown };

function isExecution(value: unknown): value is Execution {
  return isObject(value) && value.kind === "llm_evidence_tool_execution";
}

/** The arrival ran and did not answer `ok: false`. */
function landed(value: unknown): boolean {
  if (!isExecution(value)) return false;
  return !(isObject(value.evidence) && value.evidence.ok === false);
}

function stateAnswer(value: unknown): value is { state: JsonObject; differs: string[] } {
  return isObject(value) && isObject(value.state) && Array.isArray(value.differs) && value.differs.every((entry) => typeof entry === "string");
}

function isObject(value: unknown): value is Record<string, unknown> & JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
