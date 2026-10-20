// A Flow build as one traced episode (D9): activity `exploration`, its episode
// id `build.<uuid>` minted as the episode opens, and that same id used as the
// build id inside the build (`./build-id.ts`, read where the service mints the
// build id), so one id names the build in its trace, its routing and its
// project build record. Wraps the build's activity scope, which the service's
// build entry used directly; the service hands over only readers of what it
// already stored, and every decision about tracing is made here.
//
// Nothing installed (tracing off, or a test that installed none): exactly the
// activity scope, nothing read and nothing opened.

import { randomUUID } from "node:crypto";
import { withAutomationStudioBuildActivity } from "../../activity/index.ts";
import { AUTOMATION_STUDIO_GATEWAY_TRACE_CONTEXT } from "./context-schemas.ts";
import { automationStudioGatewayTraceConversationContext } from "./conversation-turn.ts";
import { AutomationStudioGatewayTraceInstallation } from "../installation.ts";
import { automationStudioGatewayTraceStoredInstructions } from "./stored-instructions.ts";
import type { AutomationStudioGatewayTraceBuildSources } from "./types.ts";

type BuildTarget = { projectId?: unknown; flowId?: unknown; authoringMode?: unknown; mode?: unknown; evidenceGuided?: unknown; startLocation?: unknown };

/** Runs one Flow build in its activity scope and, when tracing is installed, as one traced exploration episode. */
export async function withAutomationStudioGatewayTraceBuildActivity<T>(target: BuildTarget, sources: AutomationStudioGatewayTraceBuildSources, fn: () => Promise<T>): Promise<T> {
  return await withAutomationStudioBuildActivity(target, async () => {
    const episodes = AutomationStudioGatewayTraceInstallation.current();
    if (episodes === undefined || typeof target.projectId !== "string" || !target.projectId) return await fn();
    const projectId = target.projectId;
    const flowId = typeof target.flowId === "string" && target.flowId ? target.flowId : undefined;
    const episodeId = `build.${randomUUID()}`;
    const value = {
      kind: "build",
      buildId: episodeId,
      flowId: flowId ?? null,
      authoringMode: typeof target.authoringMode === "string" ? target.authoringMode : null,
      mode: typeof target.mode === "string" ? target.mode : null,
      evidenceGuided: target.evidenceGuided === true,
      startLocation: typeof target.startLocation === "string" ? target.startLocation : null,
      instructions: await automationStudioGatewayTraceStoredInstructions(sources.instructions),
      conversation: await automationStudioGatewayTraceConversationContext(sources.conversations, projectId)
    };
    const context = { schema: AUTOMATION_STUDIO_GATEWAY_TRACE_CONTEXT.build, value };
    return await episodes.run({ projectId, episodeId, activity: "exploration", context, ...(flowId ? { flowId } : {}) }, fn);
  });
}
