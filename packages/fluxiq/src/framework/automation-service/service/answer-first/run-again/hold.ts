// What a person's press of Run again holds while the generation path runs, as a carry-on's does
// (`../carry-on/hold.ts`): `service.ts` and the generation path do not change, and the attempt's
// opening reads it. **Only a route sets it**: no field of any request stands behind it, so nothing a
// model writes can say a person asked for this.

import { AsyncLocalStorage } from "node:async_hooks";
import type { AutomationStudioAnswerFirstKeptCallerOptions } from "../../flow-bootstrap-commands/index.ts";

export type AutomationStudioAnswerFirstRunAgainHold = {
  projectId: string;
  flowId: string;
  taskId: string;
  attemptId: string;
  /** The options the task's latest attempt kept from its caller, which the new attempt goes on under (`../caller/held.ts`). */
  caller?: AutomationStudioAnswerFirstKeptCallerOptions | undefined;
  /** The attempt took it, and no later attempt in this scope may. */
  opened: boolean;
};

export const automationStudioAnswerFirstRunAgainScope = new AsyncLocalStorage<AutomationStudioAnswerFirstRunAgainHold>();
