import type { AutomationStudioInputRevision } from "../../../../../runtime/input-basis/index.ts";

/**
 * Where one assembled entry layer's values came from, declared by trusted service code and never read from request JSON.
 * `request`: the operation's own authenticated request or caller channel, read by the service itself.
 * `revision`: a normal-input revision this owner issued earlier (a root input from an earlier run), reopened by its
 * exact owner/binding/revision under the same trusted project, task and principal before it counts.
 */
export type AutomationStudioInputUseOrigin =
  | Readonly<{ kind: "request" }>
  | Readonly<{ kind: "revision"; producerId: string; reference: AutomationStudioInputRevision }>;
