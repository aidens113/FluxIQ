import { resolveAutomationStudioContext, resolveClientRecordingProject, setAutomationStudioContext, type AutomationStudioWebContext } from "../../automation-studio-context";
import { WorkspacePresentationError } from "./failure";
import type { WorkspaceContextSelection, WorkspacePresentationCaller, WorkspaceRecordingContextProvider } from "./model";

/** One instance-owned namespace; the original helper retains key/preference/freshness semantics. */
export class WorkspacePresentationContexts {
  private contexts: Record<string, AutomationStudioWebContext> = Object.create(null);
  private readonly intents = new Map<string, Map<string | undefined, symbol>>();

  constructor(private readonly now: () => number) {}

  resolve(caller: WorkspacePresentationCaller): AutomationStudioWebContext | undefined {
    const context = resolveAutomationStudioContext(this.contexts, caller.userId, caller.clientId);
    return context ? { ...context } : undefined;
  }

  count(caller?: WorkspacePresentationCaller): number {
    if (!caller) return 0;
    return Object.values(this.contexts).filter(context => context.operatorUserId === caller.userId && (!caller.clientId || !context.clientId || context.clientId === caller.clientId)).length;
  }

  begin(caller: WorkspacePresentationCaller): (selection: WorkspaceContextSelection) => void {
    const intents = this.intents.get(caller.userId) ?? new Map<string | undefined, symbol>();
    this.intents.set(caller.userId, intents);
    const token = Symbol();
    intents.set(caller.clientId, token);
    let committed = false;
    return selection => {
      if (committed || intents.get(caller.clientId) !== token) throw new WorkspacePresentationError("context_write_stale");
      const activeProjectId = selection.activeProjectId?.trim() || null;
      const activeFlowId = activeProjectId ? selection.activeFlowId?.trim() || null : null;
      setAutomationStudioContext(this.contexts, { operatorUserId: caller.userId, ...(caller.clientId ? { clientId: caller.clientId } : {}), activeProjectId, activeFlowId }, this.now());
      committed = true;
    };
  }

  recording(input: Parameters<WorkspaceRecordingContextProvider>[0]): ReturnType<typeof resolveClientRecordingProject> {
    return resolveClientRecordingProject(this.contexts, { ...(input.session.operatorUserId ? { operatorUserId: input.session.operatorUserId } : {}), clientId: input.session.clientId, ...(input.request.projectId !== undefined ? { requestedProjectId: input.request.projectId } : {}) });
  }

  clear(): void {
    this.contexts = Object.create(null);
    this.intents.clear();
  }
}
