import type { AutomationStudioRuntimeSession } from "../../../model/index.ts";
import type { AutomationStudioGraphExecutionOptions } from "../../executor/index.ts";
import type { AutomationStudioExecutorCommandRun } from "../../executor/command-scope/index.ts";
import type { AutomationStudioRuntimeInterventionMode } from "../runtime-adaptation/index.ts";
import { endAutomationStudioRuntimeSessionAfterThrow, type AutomationStudioRuntimeSessionEndingPorts } from "../runtime-session/index.ts";
import type { AutomationStudioCommandExecutionController } from "./controller.ts";

/** Restrictive public-entry lifecycle; only the actual controller opens authority. */
export class AutomationStudioRequiredCommandRun {
  readonly required: boolean;
  private run?: AutomationStudioExecutorCommandRun;
  private controller?: AutomationStudioCommandExecutionController;
  constructor(input: { commandOutcomeMode?: "required"; projectId?: string | null; adaptiveMode?: AutomationStudioRuntimeInterventionMode }, storageAvailable: boolean) {
    if (input.commandOutcomeMode !== undefined && input.commandOutcomeMode !== "required") throw new Error("command_execution.invalid_mode");
    this.required = input.commandOutcomeMode === "required";
    if (this.required && (!input.projectId || !storageAvailable)) throw new Error("command_execution.storage_required");
    if (this.required && input.adaptiveMode !== undefined && input.adaptiveMode !== "no_llm_intervention") throw new Error("command_execution.adaptive_mode_unsupported");
  }
  validateExisting(existing: AutomationStudioRuntimeSession | null): void {
    if (this.required && existing) throw new Error("command_execution.existing_session_unsupported");
    if (!this.required && existing?.metadata?.commandOutcomeMode === "required") throw new Error("command_execution.required_mode_missing");
  }
  idempotent(session: AutomationStudioRuntimeSession): AutomationStudioRuntimeSession {
    if (this.required !== (session.metadata?.commandOutcomeMode === "required")) throw new Error("command_execution.idempotency_mode_mismatch");
    return session;
  }
  async bind(controller: AutomationStudioCommandExecutionController, owner: { projectId: string; runId: string; rootFlowId: string; signal: AbortSignal }, options: AutomationStudioGraphExecutionOptions): Promise<void> {
    if (!this.required) return;
    this.controller = controller;
    this.run = await controller.open(owner);
    options.commandRun = this.run; options.signal = this.run.signal;
  }
  async execute<T>(start: () => Promise<T>): Promise<T> { return this.run ? await this.run.own(start) : await start(); }
  async checkpoint(): Promise<void> { if (this.run) await this.run.checkpoint(); }
  async endFailure(ports: AutomationStudioRuntimeSessionEndingPorts, projectId: string | null | undefined, session: AutomationStudioRuntimeSession | undefined, error: unknown): Promise<AutomationStudioRuntimeSession> {
    if (!projectId || !session) throw error;
    const ending = await endAutomationStudioRuntimeSessionAfterThrow(ports, projectId, session.runId, error);
    if ("session" in ending) return ending.session;
    throw ending.error;
  }
  close(): void {
    // Invalidate synchronously. The controller retains drain and cleanup errors;
    // an uncooperative pipeline cannot extend the public unknown deadline.
    if (this.run) void this.controller!.closeRun(this.run).then(undefined, () => { /* best-effort: observe rejection only; the owning controller retains and rethrows cleanup errors at close */ });
  }
}
