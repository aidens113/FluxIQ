// One store per service, reached by what the service already holds. `service.ts` has a
// line limit, so it keeps no field for this: the run gate and the attempt's driver ask
// here with the same owner and get the same store, whose memory fallback both then share.

import type { AutomationStudioFlowPaths, AutomationStudioProjectPaths } from "../../paths/index.ts";
import type { AutomationStudioProjectStore } from "../../projects/index.ts";
import { AutomationStudioAnswerFirstRunActStore } from "./store.ts";

const STORES = new WeakMap<object, AutomationStudioAnswerFirstRunActStore>();

/** The service's act store, made on first ask. */
export function automationStudioAnswerFirstRunActStoreOf(owner: object, ports: { paths: Pick<AutomationStudioProjectPaths, "root">; flows: Pick<AutomationStudioFlowPaths, "flowDirectory">; projects: Pick<AutomationStudioProjectStore, "ensureProjectStructure"> }): AutomationStudioAnswerFirstRunActStore {
  const known = STORES.get(owner);
  if (known) return known;
  const made = new AutomationStudioAnswerFirstRunActStore(ports.paths, ports.flows, ports.projects);
  STORES.set(owner, made);
  return made;
}
