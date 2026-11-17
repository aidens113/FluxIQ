import type { AutomationStudioWebContext } from "../../automation-studio-context";
import { WorkspacePresentationContexts } from "./context";
import { WorkspacePresentationError } from "./failure";
import type { WorkspaceCallerPresentation, WorkspacePresentationBinding, WorkspacePresentationCaller, WorkspacePresentationHostFacts, WorkspacePresentationOwner, WorkspaceRecordingContextProvider } from "./model";
import { workspaceRuntimePresentation } from "./status";

export class BoundWorkspacePresentation implements WorkspacePresentationOwner {
  private active = true;
  private readonly contexts: WorkspacePresentationContexts;
  readonly workspaceId: string;
  readonly runtimeId: string;
  readonly recordingContextProvider: WorkspaceRecordingContextProvider;

  constructor(private readonly binding: WorkspacePresentationBinding, now: () => number, private readonly current: () => boolean, private readonly onInvalidate: () => void) {
    this.workspaceId = binding.workspaceId;
    this.runtimeId = binding.runtimeId;
    this.contexts = new WorkspacePresentationContexts(now);
    this.recordingContextProvider = input => {
      if (!this.isCurrent()) return { ok: false, code: "recording.project_required", message: "Recording context is no longer available." };
      const resolved = this.contexts.recording(input);
      if (!this.isCurrent()) return { ok: false, code: "recording.project_required", message: "Recording context is no longer available." };
      if (resolved.ok) return resolved;
      return { ok: false, code: resolved.code,
        message: resolved.code === "recording.project_context_mismatch" ? "Recording cannot start because the requested project does not match the approving operator's active project." : "Recording cannot start because Automation Studio does not have an open project.",
        metadata: { ...(input.request.projectId ? { requestedProjectId: input.request.projectId } : {}), activeProjectId: resolved.activeProjectId, contextUpdatedAt: resolved.contextUpdatedAt }
      };
    };
  }

  isCurrent(): boolean {
    if (!this.active) return false;
    let current = false;
    try { current = this.current() && (this.binding.isCurrent === undefined || this.binding.isCurrent() === true); }
    catch { current = false; }
    if (!current) this.invalidate();
    return current;
  }

  forCaller(input: WorkspacePresentationCaller): WorkspaceCallerPresentation {
    this.requireCurrent();
    if (!input || typeof input.userId !== "string" || !input.userId || input.clientId !== undefined && typeof input.clientId !== "string" || input.channel !== undefined && input.channel !== "panel" && input.channel !== "paired-client") throw new WorkspacePresentationError("caller_required");
    const caller = Object.freeze({ userId: input.userId, ...(input.clientId ? { clientId: input.clientId } : {}), channel: input.channel ?? "panel" });
    return Object.freeze<WorkspaceCallerPresentation>({
      context: () => {
        this.requireCurrent();
        return this.contexts.resolve(caller);
      },
      present: host => this.present(host, caller),
      beginContextWrite: () => {
        this.requireCurrent();
        const commit = this.contexts.begin(caller);
        return Object.freeze({ commit: (selection: Parameters<typeof commit>[0]) => {
          this.requireCurrent();
          try { commit(selection); }
          catch (error) {
            if (error instanceof WorkspacePresentationError) throw error;
            throw new WorkspacePresentationError("runtime_unavailable");
          }
          this.requireCurrent();
        } });
      }
    });
  }

  operatorStatus(host: WorkspacePresentationHostFacts) {
    this.requireCurrent();
    if (this.binding.profile === "service") throw new WorkspacePresentationError("caller_required");
    return this.present(host);
  }

  invalidate(): void {
    if (!this.active) return;
    this.active = false;
    this.contexts.clear();
    this.onInvalidate();
  }

  private present(host: WorkspacePresentationHostFacts, caller?: WorkspacePresentationCaller) {
    this.requireCurrent();
    const context: AutomationStudioWebContext | undefined = caller ? this.contexts.resolve(caller) : undefined;
    const result = workspaceRuntimePresentation(this.binding, host, context, this.contexts.count(caller), caller?.channel);
    this.requireCurrent();
    return result;
  }

  private requireCurrent(): void {
    if (!this.isCurrent()) throw new WorkspacePresentationError("stale_runtime");
  }
}
