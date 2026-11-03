import type { AutomationStudioActivityScope } from "../activity/index.ts";
import type { AutomationStudioActivityControlReader } from "../../framework/automation-service/nodes/index.ts";
import { runWithAutomationStudioActivity as runScopedActivity } from "../activity/index.ts";
import { runWithRuntimeActivityPresentation } from "../activity/presentation/index.ts";
import { currentAutomationStudioConversation } from "../conversations/context/index.ts";
import { automationStudioRuntimePresentation } from "./runtime-presentation.ts";
import { runWithAutomationStudioActivityControlReader } from "./wording/index.ts";

/** Studio composes its conversation and presentation into the framework scope. */
export function runWithAutomationStudioActivity<T>(scope: AutomationStudioActivityScope, fn: () => T, options: { pending?: boolean; readControl?: AutomationStudioActivityControlReader | undefined } = {}): T {
  const conversationId = scope.conversationId ?? currentAutomationStudioConversation(scope.projectId)?.conversationId;
  const scoped = conversationId === undefined ? scope : { ...scope, conversationId };
  return runWithAutomationStudioActivityControlReader(options.readControl, () => runWithRuntimeActivityPresentation({ invoke: automationStudioRuntimePresentation }, () => runScopedActivity(scoped, fn, options.pending === undefined ? {} : { pending: options.pending })));
}
