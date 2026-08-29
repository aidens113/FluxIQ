import type { StateSnapshot } from "fluxiq/automation-studio";
import {
  openAutomationStateView,
  type AutomationStateCommandOutcome,
  type AutomationStatePublication,
  type AutomationStateViewRequest
} from "../state/commands";
import type { AutomationProjectApi } from "../project/project-api";
import type { AutomationLiveCommandScopeController } from "./command-scope";

function stateFailure<T>(message: string): AutomationStateCommandOutcome<T> {
  return { status: "failure", code: "PROJECT_REQUIRED", error: message };
}

export class AutomationLiveStateCommands {
  private request: AbortController | null = null;

  constructor(
    private readonly api: AutomationProjectApi,
    private readonly scopes: AutomationLiveCommandScopeController
  ) {}

  abort(): void {
    this.request?.abort();
    this.request = null;
  }

  open<TState extends StateSnapshot = StateSnapshot>(
    request: AutomationStateViewRequest,
    publish: (event: AutomationStatePublication<TState>) => void
  ) {
    const scope = this.scopes.current();
    if (!scope) return Promise.resolve(stateFailure("Open a project before opening indexed State."));
    this.abort();
    this.request = new AbortController();
    return openAutomationStateView<TState>({ scope, request, signal: this.request.signal }, {
      api: this.api,
      isCurrent: (candidate) => this.scopes.isCurrent(candidate),
      publish,
      yieldToDetail: () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    });
  }
}
