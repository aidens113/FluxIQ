// What an attempt keeps of its caller's options with it in its task's memory
// (`AutomationStudioAnswerFirstKeptCallerOptions`): every option that can be written down, copied, so
// a person's press in the panel goes on under the options the attempt began with (`./held.ts`). The
// check and the person port are functions in the caller's process, and are not kept.

import type { AutomationStudioAnswerFirstCallerOptions, AutomationStudioAnswerFirstKeptCallerOptions } from "../../flow-bootstrap-commands/index.ts";

export function automationStudioAnswerFirstKeptCallerOptions(options: AutomationStudioAnswerFirstCallerOptions): AutomationStudioAnswerFirstKeptCallerOptions {
  const { taskKey, model, budgetUsd, judge, scope, inputs } = options;
  return structuredClone({
    ...(taskKey === undefined ? {} : { taskKey }),
    ...(model === undefined ? {} : { model }),
    ...(budgetUsd === undefined ? {} : { budgetUsd }),
    ...(judge === undefined ? {} : { judge }),
    ...(scope === undefined ? {} : { scope }),
    ...(inputs === undefined ? {} : { inputs })
  });
}
