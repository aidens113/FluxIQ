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
//
// **Each act's own page (t471).** The start page alone vouched for every act:
// lane D round 9 (`run-mv5q4j2n-25784472`) began on a home page that showed
// nothing of the requests its trial confirmed, so a dirty site read as clean.
// `read` reads the target where it stands, without moving it, so the candidate
// loop can keep the state of an act's page just before the act and what the
// act changed there; `compareAt` takes the target back to that page -- the
// arrival's own node, with the `location` the domain answered in place of the
// start -- and says what differs from the state before the act.

import type { JsonObject } from "../../../../../core/index.ts";
import { automationStudioActionPermissionDenied } from "../../action-permissions/index.ts";
import { AUTOMATION_STUDIO_LLM_RUN_NODE_TOOL_ID, type AutomationStudioLlmEvidenceRuntimeBinding, type AutomationStudioLlmEvidenceTool } from "../../llm/index.ts";
import type { AutomationStudioSiteResetComparison, AutomationStudioSiteResetLines, AutomationStudioSiteResetPlace, AutomationStudioSiteResetReadAnswer } from "./contracts.ts";

type Execute = (call: { callId: string; toolId: string; value: JsonObject; signal?: AbortSignal }) => Promise<unknown>;

export class AutomationStudioSiteResetStartCheck {
  private attempted = false;
  private start: JsonObject | undefined;
  private checks = 0;
  private reads = 0;
  private places = 0;
  /** Why the last read or comparison could not be made, kept for a reader rather than dropped. */
  private lastFailure: unknown;

  constructor(private readonly input: {
    binding: Pick<AutomationStudioLlmEvidenceRuntimeBinding, "startState" | "runsNodes"> | undefined;
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

  /** Reads the target where it stands, against `start` when given, or says why it could not. Never moves it. */
  async read(start?: JsonObject, signal?: AbortSignal): Promise<AutomationStudioSiteResetReadAnswer> {
    const startState = this.input.binding?.startState;
    if (!startState) return { unread: "no_reader" };
    this.reads += 1;
    try {
      const read = await startState.call(this.input.binding, { projectId: this.input.projectId, flowId: this.input.flowId, callId: `site-reset.read.${this.reads}`, ...(start ? { start: structuredClone(start) } : {}), permission: automationStudioActionPermissionDenied, ...(signal ? { signal } : {}) });
      if (!stateAnswer(read)) return { unread: "no_answer" };
      const lines = linesOf(read.lines);
      return { state: structuredClone(read.state), differs: [...read.differs], ...(typeof read.location === "string" && read.location ? { location: read.location } : {}), ...(lines ? { lines } : {}) };
    } catch (error) {
      if (signal?.aborted) throw error;
      this.lastFailure = error;
      return { unread: "failed" };
    }
  }

  /** Takes the target to the page an act was made on and says what differs from it before the act; `differs` is absent when that cannot be said. */
  async compareAt(place: AutomationStudioSiteResetPlace, signal?: AbortSignal): Promise<AutomationStudioSiteResetComparison> {
    const tool = this.input.tools.find((entry) => entry.toolId === AUTOMATION_STUDIO_LLM_RUN_NODE_TOOL_ID);
    const to = this.input.binding?.runsNodes?.arrival;
    if (!this.input.binding?.startState || !tool || !to || !to.parameter || !place.location) return { moved: false };
    this.places += 1;
    const n = this.places;
    let moved = false;
    try {
      // The arrival's own node, as `../../llm/node-tools/run-node.ts` writes the build's start into it: nothing lasting.
      const ran = await this.input.executeTool({ callId: `site-reset.place.${n}.arrival`, toolId: tool.toolId, value: { node: to.node, parameters: { [to.parameter]: place.location }, consequences: [] }, ...(signal ? { signal } : {}) });
      moved = isExecution(ran) && ran.effectApplied === true;
      if (!landed(ran)) return { moved };
      const read = await this.read(place.state, signal);
      return "unread" in read ? { moved } : { moved, differs: read.differs, ...(read.lines ? { lines: read.lines } : {}) };
    } catch (error) {
      if (signal?.aborted) throw error;
      this.lastFailure = error;
      return { moved };
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

/** The domain's lines, when it gave them in the agreed shape. */
function linesOf(value: unknown): AutomationStudioSiteResetLines | undefined {
  if (!isObject(value) || !strings(value.gone) || !strings(value.added)) return undefined;
  return { gone: [...value.gone], added: [...value.added] };
}

function strings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function stateAnswer(value: unknown): value is { state: JsonObject; differs: string[]; location?: unknown; lines?: unknown } {
  return isObject(value) && isObject(value.state) && Array.isArray(value.differs) && value.differs.every((entry) => typeof entry === "string");
}

function isObject(value: unknown): value is Record<string, unknown> & JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
