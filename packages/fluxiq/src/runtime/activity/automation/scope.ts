import type { AutomationStudioActivityScope } from "../index.ts";
import { runWithAutomationStudioActivity as runScopedActivity } from "../index.ts";
import { runWithRuntimeActivityPresentation } from "../presentation/index.ts";
import { currentAutomationStudioConversation } from "../../interaction/conversations/context/index.ts";
import { automationStudioRuntimePresentation } from "./runtime-presentation.ts";

/** Studio composes its conversation and presentation into the framework scope. */
export function runWithAutomationStudioActivity<T>(scope: AutomationStudioActivityScope, fn: () => T, options: { pending?: boolean } = {}): T {
  const conversationId = scope.conversationId ?? currentAutomationStudioConversation(scope.projectId)?.conversationId;
  const scoped = conversationId === undefined ? scope : { ...scope, conversationId };
  return runWithRuntimeActivityPresentation({ invoke: automationStudioRuntimePresentation }, () => runScopedActivity(scoped, fn, options));
}
