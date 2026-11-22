// One chat-permission store per service, reached by what the service already holds (as
// `../run-acts/store-of.ts`): `service.ts` has a line limit, so it keeps no field for this.

import type { AutomationStudioFlowPaths, AutomationStudioProjectPaths } from "../../paths/index.ts";
import type { AutomationStudioProjectStore } from "../../projects/index.ts";
import { AutomationStudioAnswerFirstChatPermissionStore } from "./store.ts";

const STORES = new WeakMap<object, AutomationStudioAnswerFirstChatPermissionStore>();

/** The service's chat-permission store, made on first ask. */
export function automationStudioAnswerFirstChatPermissionOf(owner: object, ports: { paths: Pick<AutomationStudioProjectPaths, "root">; flows: Pick<AutomationStudioFlowPaths, "flowDirectory">; projects: Pick<AutomationStudioProjectStore, "ensureProjectStructure"> }): AutomationStudioAnswerFirstChatPermissionStore {
  const known = STORES.get(owner);
  if (known) return known;
  const made = new AutomationStudioAnswerFirstChatPermissionStore(ports.paths, ports.flows, ports.projects);
  STORES.set(owner, made);
  return made;
}
