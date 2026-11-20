import { AutomationStudioGraphInputUseSession } from "../../../../../engine/automation/input-use/index.ts";
import type { AutomationStudioInputBasisStorage, AutomationStudioInputScope } from "../../../../../runtime/input-basis/index.ts";
import { AutomationStudioInputBasisStore } from "../store.ts";
import type { AutomationStudioInputUseEntry } from "./entry.ts";
import { AutomationStudioInputUseServiceAuthority } from "./authority.ts";

type Store = ConstructorParameters<typeof AutomationStudioInputBasisStore>;
/** The service's own durable stores this authority needs, all public on `AutomationStudioService`; nothing else of it. */
type ServiceStores = { readonly projectPaths: Store[0]; readonly projects: Store[1]; readonly runDatasets: Store[2] };

/**
 * The service's graph-entry input authority over its own durable normal-input owner. Nothing is attached by default:
 * a run opts in by opening one explicit session, and closes it once it has read that run's observation.
 */
export class AutomationStudioInputUseExecutions {
  constructor(private readonly storage: () => AutomationStudioInputBasisStorage) {}

  /** The typed seam a service's own code opens sessions through, over the stores it already owns; it adds nothing to the service. */
  static of(service: ServiceStores): AutomationStudioInputUseExecutions {
    return new AutomationStudioInputUseExecutions(() => new AutomationStudioInputBasisStore(service.projectPaths, service.projects, service.runDatasets));
  }

  /** `scope` comes from the calling service code's authenticated owners, never from request JSON. */
  open(scope: AutomationStudioInputScope, entry: AutomationStudioInputUseEntry): AutomationStudioGraphInputUseSession {
    return new AutomationStudioGraphInputUseSession(new AutomationStudioInputUseServiceAuthority({ storage: this.storage(), scope, entry }));
  }
}
