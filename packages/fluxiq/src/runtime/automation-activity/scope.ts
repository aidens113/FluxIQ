import type { AutomationStudioActivityScope } from "../activity/index.ts";
import { runWithAutomationStudioDomainReadings, type AutomationStudioDomainReadings } from "../domain-readings/index.ts";
import { runWithAutomationStudioActivity as runScopedActivity } from "../activity/index.ts";
import { runWithRuntimeActivityPresentation } from "../activity/presentation/index.ts";
import { currentAutomationStudioConversation } from "../conversations/context/index.ts";
import { automationStudioRuntimePresentation } from "./runtime-presentation.ts";

/** Studio composes its conversation and presentation into the framework scope. */
export function runWithAutomationStudioActivity<T>(scope: AutomationStudioActivityScope, fn: () => T, options: { pending?: boolean; readings?: Readonly<AutomationStudioDomainReadings> | undefined } = {}): T {
  const conversationId = scope.conversationId ?? currentAutomationStudioConversation(scope.projectId)?.conversationId;
  const scoped = conversationId === undefined ? scope : { ...scope, conversationId };
  const run = (): T => runWithRuntimeActivityPresentation({ invoke: automationStudioRuntimePresentation }, () => runScopedActivity(scoped, fn, options.pending === undefined ? {} : { pending: options.pending }));
  return options.readings ? runWithAutomationStudioDomainReadings(options.readings, run) : run();
}
