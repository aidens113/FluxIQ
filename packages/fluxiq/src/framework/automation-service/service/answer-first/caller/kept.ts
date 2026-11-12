// What an attempt keeps of its caller's options with it in its task's memory
// (`AutomationStudioAnswerFirstKeptCallerOptions`): every option that can be written down, copied, so
// a person's press in the panel goes on under the options the attempt began with (`./held.ts`). The
// check and the person port are functions in the caller's process, and are not kept.

import type { AutomationStudioAnswerFirstCallerOptions, AutomationStudioAnswerFirstKeptCallerOptions } from "../../flow-bootstrap-commands/index.ts";

export function automationStudioAnswerFirstKeptCallerOptions(options: AutomationStudioAnswerFirstCallerOptions): AutomationStudioAnswerFirstKeptCallerOptions {
  const { taskKey, actScope, model, budgetUsd, judge, scope, inputs, runOverrides, humanness } = options;
  return structuredClone({
    ...(taskKey === undefined ? {} : { taskKey }),
    // Which execution the attempt's acts belong to: what a later attempt's opening matches before it carries them (`../attempt/opening.ts`).
    ...(actScope === undefined ? {} : { actScope }),
    ...(model === undefined ? {} : { model }),
    ...(budgetUsd === undefined ? {} : { budgetUsd }),
    ...(judge === undefined ? {} : { judge }),
    ...(scope === undefined ? {} : { scope }),
    ...(inputs === undefined ? {} : { inputs }),
    ...(runOverrides === undefined ? {} : { runOverrides }),
    // The person's chosen humanness goes on under a press too (I1): a press is the same attempt, paced the same way.
    ...(humanness === undefined ? {} : { humanness })
  });
}
