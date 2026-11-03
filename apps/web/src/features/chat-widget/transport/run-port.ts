// Stop, Take over and Hand back over Core's run-control endpoints, as the
// extension's panel relay sends them (`background/panel/run-control.ts`):
//
//   stop (a build)  `cancel-flow-bootstrap` with the Flow
//   stop (a run)    `cancel-runtime-session` with the run
//   stop (neither)  every run of the project not over, found with
//                   `list-runtime-sessions`, each cancelled
//   take over       `pause-runtime-session` with `takeControl`
//   hand back       `resume-runtime-session` with `afterManualAction`
//
// `openInstructions` is absent: the panel shows a run's task instructions in
// its own Studio, not in this chat, so the recovery button never shows.

import type { ChatResult, ChatRunPort } from "@fluxiq/ui-components";
import type { ProgramCommandTransport } from "../../automation-studio/data/program-transport";
import { chatFailure } from "./chat-failure";
import { chatResult } from "./chat-result";
import type { ProgramChatTransportOptions } from "./options";
import { projectFor } from "./project-for";

const STOP_REASON = "Stopped from the chat.";
const ACTIVE_RUN_SCAN_LIMIT = 25;
const ACTIVE_RUN_STATES = ["queued", "running", "waiting", "interrupted"];
const ENDED_RUN_STATES = new Set(["succeeded", "failed", "cancelled"]);

export function createRunPort(api: ProgramCommandTransport, options: Pick<ProgramChatTransportOptions, "projectId">): ChatRunPort {
  return {
    async stop(target) {
      const project = projectFor(target.projectId, options);
      if (!project.ok) return project.failure;
      const { projectId } = project;
      if (target.runId && target.flowId) return { ok: false, code: "invalid_request", sentence: "Stop must name a run or a build, not both." };
      if (target.flowId) return chatResult(await api.post<{ cancellationRequested?: unknown }>("cancel-flow-bootstrap", { projectId, flowId: target.flowId }), cancellation);
      if (target.runId) return chatResult(await api.post<{ cancellationRequested?: unknown }>("cancel-runtime-session", { projectId, runId: target.runId, reason: STOP_REASON }), cancellation);

      const listed = await api.post<{ runtimeSessions?: unknown }>("list-runtime-sessions", { projectId, summaries: true, statuses: ACTIVE_RUN_STATES, limit: ACTIVE_RUN_SCAN_LIMIT });
      if (!listed.ok) return chatFailure(listed);
      const sessions = listed.payload?.runtimeSessions;
      for (const runId of activeRunIds(Array.isArray(sessions) ? sessions : [])) {
        const stopped = await api.post("cancel-runtime-session", { projectId, runId, reason: STOP_REASON });
        if (!stopped.ok) return chatFailure(stopped);
      }
      return { ok: true, value: {} };
    },

    async takeOver(target): Promise<ChatResult<unknown>> {
      const project = projectFor(target.projectId, options);
      if (!project.ok) return project.failure;
      return chatResult(await api.post("pause-runtime-session", { projectId: project.projectId, runId: target.runId, takeControl: true }));
    },

    async handBack(target): Promise<ChatResult<unknown>> {
      const project = projectFor(target.projectId, options);
      if (!project.ok) return project.failure;
      return chatResult(await api.post("resume-runtime-session", { projectId: project.projectId, runId: target.runId, afterManualAction: true }));
    }
  };
}

function cancellation(payload: { cancellationRequested?: unknown } | undefined): { cancellationRequested?: boolean } {
  return typeof payload?.cancellationRequested === "boolean" ? { cancellationRequested: payload.cancellationRequested } : {};
}

function activeRunIds(sessions: readonly unknown[]): string[] {
  const ids: string[] = [];
  for (const session of sessions) {
    const { runId, status } = (session ?? {}) as { runId?: unknown; status?: unknown };
    if (typeof runId === "string" && typeof status === "string" && !ENDED_RUN_STATES.has(status)) ids.push(runId);
  }
  return ids;
}
