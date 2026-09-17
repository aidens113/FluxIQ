import type { JsonObject } from "../../../../../core/index.ts";
import { ProgramJsonStore } from "../../../../_shared/storage.ts";
import type { AutomationStudioFlowRunDetail, AutomationStudioRuntimeSession } from "../../../model/index.ts";
import type { AutomationStudioFlowPaths } from "../paths/index.ts";
import { runtimeSessionToFlowRunDetail } from "../summaries/index.ts";
import { withConfiguredRuntimeStreamStore, type AutomationStudioRuntimeStreamStoreAccess } from "./configured-runtime-stream-store.ts";

export type AutomationStudioFlowRunDetailReadPorts = AutomationStudioRuntimeStreamStoreAccess & {
  flowPaths: AutomationStudioFlowPaths;
  /** The service's public methods, called through the service so an override is honoured. */
  getRuntimeSession(projectId: string, runId: string): Promise<AutomationStudioRuntimeSession | null>;
  saveFlowRunDetail(detail: AutomationStudioFlowRunDetail): Promise<AutomationStudioFlowRunDetail>;
};

/**
 * One run's detail: from the typed runtime store when it holds the run, else
 * from the legacy JSON detail, else rebuilt from the run's session and saved.
 * `null` only when none of the three has the run.
 *
 * Every step is strict. A typed store that is configured but cannot be opened
 * or read, and a legacy detail or session file that is present but unreadable,
 * each fail the read. Taken as "not held", they would send the read on to the
 * rebuild, which saves the bare session projection over a run that is stored.
 */
export async function readAutomationStudioFlowRunDetail(
  ports: AutomationStudioFlowRunDetailReadPorts,
  projectId: string,
  runId: string,
  options: { includeCollections?: boolean } = {}
): Promise<AutomationStudioFlowRunDetail | null> {
  const typed = await withConfiguredRuntimeStreamStore(ports, projectId, async (store) => await store.getRunDetail(runId, options));
  if (typed) return typed;
  const stored = await new ProgramJsonStore<JsonObject>(ports.flowPaths.flowRunDetailFile(projectId, runId), () => ({})).read();
  if (typeof (stored.summary as { runId?: unknown } | undefined)?.runId === "string") return stored as unknown as AutomationStudioFlowRunDetail;
  const session = await ports.getRuntimeSession(projectId, runId);
  if (!session) return null;
  return await ports.saveFlowRunDetail({
    ...runtimeSessionToFlowRunDetail(session, projectId),
    metadata: {
      ...(session.metadata ?? {}),
      partialWriteRecovery: { recoveredAt: Date.now(), source: "runtime-session" }
    }
  });
}
