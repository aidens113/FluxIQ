// One task memory per service, reached by what the service already holds (as
// `../attempt-store/store-of.ts`): `service.ts` has a line limit, so it keeps no field for this.

import type { AutomationStudioProjectPaths } from "../../paths/index.ts";
import type { AutomationStudioProjectStore } from "../../projects/index.ts";
import { AutomationStudioAnswerFirstTaskMemoryStore } from "./store.ts";

const STORES = new WeakMap<object, AutomationStudioAnswerFirstTaskMemoryStore>();

export type AutomationStudioAnswerFirstTaskMemoryPorts = { paths: Pick<AutomationStudioProjectPaths, "root" | "projectFile">; projects: Pick<AutomationStudioProjectStore, "ensureProjectStructure"> };

/** The service's task memory, made on first ask. */
export function automationStudioAnswerFirstTaskMemoryOf(owner: object, ports: AutomationStudioAnswerFirstTaskMemoryPorts): AutomationStudioAnswerFirstTaskMemoryStore {
  const known = STORES.get(owner);
  if (known) return known;
  const made = new AutomationStudioAnswerFirstTaskMemoryStore(ports.paths, ports.projects);
  STORES.set(owner, made);
  return made;
}
