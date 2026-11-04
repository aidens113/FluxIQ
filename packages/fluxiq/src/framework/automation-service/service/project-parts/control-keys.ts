import type { AutomationStudioProjectDatabasePool } from "../../../persistence/automation/index.ts";
import type { AutomationStudioProjectPartRunPorts } from "./run/index.ts";

// Which of a step's parameters name the control it acts on is the bound domain's to say
// (`controlParameterKeys` in its implementation bundle), and a host binds its domain after
// the service is built. A Flow's save reaches the library by its pool alone, from a file
// that is frozen (`.structure-baseline.json`), so the library hands over how to ask here as
// it is built, and a save asks by the pool. Held weakly, as the service's trial collaborators
// are (`../trial-ports/collaborator-registry.ts`).

type Reader = () => ReadonlySet<string> | undefined;

const readers = new WeakMap<AutomationStudioProjectDatabasePool, Reader>();

/** The keys the bound domain names, from the executor's parts a run also reads. */
export function automationStudioProjectPartControlKeys(run: Pick<AutomationStudioProjectPartRunPorts, "collaborators"> | undefined): ReadonlySet<string> | undefined {
  const executor = run?.collaborators()?.executor();
  return executor?.nativeNodeRuntime?.getTargetHooks(executor.io?.domainId)?.controlParameterKeys;
}

export const AutomationStudioProjectPartControlKeys = Object.freeze({
  adopt(pool: AutomationStudioProjectDatabasePool, read: Reader): void {
    readers.set(pool, read);
  },
  /** The keys for this pool's service, or nothing where no domain says, which leaves Core's default. */
  of(pool: AutomationStudioProjectDatabasePool): ReadonlySet<string> | undefined {
    return readers.get(pool)?.();
  }
});
