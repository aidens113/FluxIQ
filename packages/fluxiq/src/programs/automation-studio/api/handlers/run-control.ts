// Pausing a live run, handing its page to a person, and letting it go on.
//
// `authoring` under `runtime.control`, the same as starting and stopping a run:
// holding a run removes nothing and acts nowhere outside, so it must never wait
// behind a PIN. Each answer carries the run's control as it now stands and the
// one progress status a person is shown, so a surface never has to work out
// "paused" from a stored status that, by design, still says `running`.
//
// Asking about a run that is not executing here -- queued, parked on a
// question, over, or unknown -- is not an error. It answers with no control and
// the run's progress as it stands, the way stopping a run that already ended
// answers with the run as it ended, so pressing Pause or Continue twice, or
// after the run finished, is never a failure.

import { AUTOMATION_STUDIO_ENDPOINTS } from "../contracts.ts";
import { automationStudioRunControlOf, automationStudioRunProgress, type AutomationStudioRunControlSnapshot, type AutomationStudioRunProgress } from "../../runtime/index.ts";
import type { AutomationStudioRuntimeSession } from "../../model/index.ts";
import type { AutomationStudioApiDependencies } from "./dependencies.ts";

/**
 * What every run-control endpoint answers. `live` is whether the run was
 * executing in this FluxIQ when asked: for a pause or resume, whether the
 * request reached a live run and took effect. `runControl` and `progress` are
 * the run as it stands after it, so a run that finished straight after being
 * resumed is `live` (the resume took effect) with no control left and
 * Completed progress.
 */
export type AutomationStudioRunControlAnswer = {
  runId: string;
  sessionStatus: AutomationStudioRuntimeSession["status"] | null;
  live: boolean;
  runControl: AutomationStudioRunControlSnapshot | null;
  progress: AutomationStudioRunProgress | null;
};

type RunTarget = { projectId: string; runId: string };

/** A run in one of these states has no control left to hold, whatever a stale controller says. */
const ENDED: ReadonlySet<AutomationStudioRuntimeSession["status"]> = new Set(["succeeded", "failed", "cancelled"]);

export function registerRunControlEndpoints(dependencies: AutomationStudioApiDependencies): void {
  const { registry, service } = dependencies;
  const runControl = () => automationStudioRunControlOf(service);
  const answer = async (target: RunTarget, control: AutomationStudioRunControlSnapshot | null, acted: boolean): Promise<AutomationStudioRunControlAnswer> => {
    const session = await service.getRuntimeSession(target.projectId, target.runId);
    // A run that ended between the request and this read is reported as it ended.
    const holding = Boolean(session && control && !ENDED.has(session.status));
    return {
      runId: target.runId,
      sessionStatus: session?.status ?? null,
      live: acted ? Boolean(control) : holding,
      runControl: holding ? control : null,
      progress: session ? automationStudioRunProgress(session, holding ? control : null) : null
    };
  };

  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.pauseRuntimeSession,
    permission: "runtime.control",
    classification: "authoring",
    handler: async (request) => {
      const payload = record(request.payload);
      const target = runTarget(payload);
      if (!target) return { ok: false, error: "Pausing a run needs its project and run IDs." };
      if (payload.takeControl !== undefined && typeof payload.takeControl !== "boolean") return { ok: false, error: "takeControl must be true or false." };
      const reason = text(payload.reason);
      const control = runControl()?.pause(target.projectId, target.runId, { holder: payload.takeControl === true ? "person" : "fluxiq", ...(reason ? { reason } : {}) }) ?? null;
      return { ok: true, payload: await answer(target, control, true) };
    }
  });

  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.resumeRuntimeSession,
    permission: "runtime.control",
    classification: "authoring",
    handler: async (request) => {
      const payload = record(request.payload);
      const target = runTarget(payload);
      if (!target) return { ok: false, error: "Resuming a run needs its project and run IDs." };
      if (payload.afterManualAction !== undefined && typeof payload.afterManualAction !== "boolean") return { ok: false, error: "afterManualAction must be true or false." };
      const note = text(payload.note);
      const control = runControl()?.resume(target.projectId, target.runId, { afterManualAction: payload.afterManualAction === true, ...(note ? { note } : {}) }) ?? null;
      return { ok: true, payload: await answer(target, control, true) };
    }
  });

  registry.register({
    programId: "automation-studio",
    endpoint: AUTOMATION_STUDIO_ENDPOINTS.getRuntimeRunControl,
    permission: "programs.read",
    classification: "read",
    handler: async (request) => {
      const target = runTarget(record(request.payload));
      if (!target) return { ok: false, error: "Reading a run's control needs its project and run IDs." };
      return { ok: true, payload: await answer(target, runControl()?.snapshot(target.projectId, target.runId) ?? null, false) };
    }
  });
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function runTarget(payload: Record<string, unknown>): RunTarget | null {
  const projectId = typeof payload.projectId === "string" ? payload.projectId.trim() : "";
  const runId = typeof payload.runId === "string" ? payload.runId.trim() : "";
  return projectId && runId ? { projectId, runId } : null;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 500) : undefined;
}
