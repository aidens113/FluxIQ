// One store per service, reached by what the service already holds (as `../run-acts/store-of.ts`):
// `service.ts` has a line limit, so it keeps no field for this. The attempt's driver and the
// Answer lane ask here with the same owner and share its memory fallback.

import type { AutomationStudioFlowPaths, AutomationStudioProjectPaths } from "../../paths/index.ts";
import type { AutomationStudioProjectStore } from "../../projects/index.ts";
import { AutomationStudioAnswerFirstAttemptStore } from "./store.ts";

const STORES = new WeakMap<object, AutomationStudioAnswerFirstAttemptStore>();

/** The service's attempt store, made on first ask. */
export function automationStudioAnswerFirstAttemptStoreOf(owner: object, ports: { paths: Pick<AutomationStudioProjectPaths, "root">; flows: Pick<AutomationStudioFlowPaths, "flowDirectory">; projects: Pick<AutomationStudioProjectStore, "ensureProjectStructure"> }): AutomationStudioAnswerFirstAttemptStore {
  const known = STORES.get(owner);
  if (known) return known;
  const made = new AutomationStudioAnswerFirstAttemptStore(ports.paths, ports.flows, ports.projects);
  STORES.set(owner, made);
  return made;
}
