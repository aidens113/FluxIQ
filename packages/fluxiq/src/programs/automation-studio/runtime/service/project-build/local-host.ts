import type { AutomationStudioHostResourceAcquireResult, AutomationStudioHostResourceLease, AutomationStudioHostResourcePort } from "../../project-agents/index.ts";

// The host resource a project build is scheduled on when its domain declares
// none (unit A5c): one resource, so builders run one at a time, as a host
// with no resources to lease can only run one agent's commands at once.
//
// Its grant names a gateway session no client has, so a held lease makes
// unleased commands strict for that session alone and never refuses another
// client's or project's (`project-agents/host-resources/lease-scope.ts`). One
// port for the process, so every build without a host port shares its one
// scheduler (`project-agents/dispatch/host-lease.ts`).

/** The session the local grant names: no gateway client has it. */
const LOCAL_SESSION = "core.project-build.local";

class AutomationStudioProjectBuildLocalHost implements AutomationStudioHostResourcePort {
  readonly capacity = 1;
  private epoch = 0;
  private held = false;

  acquire(): AutomationStudioHostResourceAcquireResult {
    if (this.held) return "at_capacity";
    this.held = true;
    this.epoch += 1;
    return { resourceKey: "core.project-build.local", epoch: this.epoch, sessionId: LOCAL_SESSION };
  }

  release(lease: AutomationStudioHostResourceLease): void {
    if (lease.epoch === this.epoch) this.held = false;
  }
}

export const AUTOMATION_STUDIO_PROJECT_BUILD_LOCAL_HOST: AutomationStudioHostResourcePort = new AutomationStudioProjectBuildLocalHost();
