// Names a run once its session is admitted (D9): the activity scope, as the
// service's run did directly, and -- when tracing is installed -- the pending
// traced frame its activity scope entered (`./run-activity.ts`), opening the
// run's trace under the run id with the run's input and the chat turn that
// started it as its manifest context. Everything the run sends from here on
// records into that trace.

import { bindAutomationStudioActivityRun } from "../../activity/index.ts";
import { AUTOMATION_STUDIO_GATEWAY_TRACE_CONTEXT } from "./context-schemas.ts";
import { automationStudioGatewayTraceConversationContext } from "./conversation-turn.ts";
import { AutomationStudioGatewayTraceInstallation } from "../installation.ts";
import type { AutomationStudioGatewayTraceRunSources } from "./types.ts";

/** Names the admitted run's activity scope and opens its trace. */
export async function bindAutomationStudioGatewayTraceRun(session: { runId: string; projectId?: string | null; flowId: string }, sources: AutomationStudioGatewayTraceRunSources): Promise<void> {
  bindAutomationStudioActivityRun(session.runId);
  const episodes = AutomationStudioGatewayTraceInstallation.current();
  if (episodes === undefined || !session.projectId || !session.runId) return;
  const conversation = await automationStudioGatewayTraceConversationContext(sources.conversations, session.projectId);
  const value = { kind: "run", runId: session.runId, flowId: session.flowId, inputs: sources.inputs ?? null, conversation };
  const context = { schema: AUTOMATION_STUDIO_GATEWAY_TRACE_CONTEXT.run, value };
  episodes.bindPending({ projectId: session.projectId, episodeId: session.runId, activity: "execution", flowId: session.flowId, context });
}
