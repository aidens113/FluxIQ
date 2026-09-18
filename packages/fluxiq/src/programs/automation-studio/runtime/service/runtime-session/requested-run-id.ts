import type { AutomationStudioRuntimeSession } from "../../../model/index.ts";

/** What checking a requested run id reaches the service for. */
export type AutomationStudioRequestedRunIdPorts = {
  getRuntimeSession(projectId: string, runId: string): Promise<AutomationStudioRuntimeSession | null>;
  /** Called before a refusal is thrown, so a run that carried an LLM grant does not leave it claimable. */
  refused?(): void;
};

const RUN_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

/**
 * The id a caller chose for the run it is about to start, or `undefined` when it chose none.
 *
 * A run started and executed in one call used to learn its id only from the
 * reply, and the reply arrives when the run has ended -- after the Flow, and
 * after the check of its result a granted run is given. A caller whose request
 * was bounded shorter than that lost the run entirely: it could not read back a
 * run it could not name, although Core had written the session under that id
 * before executing its first step. So a caller may name the new run itself,
 * and read it by that name whatever happens to the request that started it.
 *
 * `newRunId` is a different field from `runId` on purpose. `runId` names a
 * session somebody already started, and a run holding an LLM grant is refused
 * one, because a grant must never be attached to a session the grant did not
 * create. `newRunId` creates the session, so it is exactly as fresh as one Core
 * named itself; the only difference is who picked the id. What makes that safe
 * is refused here, before anything is created:
 *
 * - both at once, since a run is either an existing session or a new one;
 * - no project, since a run outside a project is never stored and its id reads
 *   nothing back;
 * - anything but a UUID, which is the only form Core gives a run id itself;
 * - an id the project already holds, since writing a new session under it
 *   would replace another run's record.
 */
export async function automationStudioRequestedRunId(
  ports: AutomationStudioRequestedRunIdPorts,
  input: { projectId?: string | null | undefined; runId?: string | undefined; newRunId?: unknown }
): Promise<string | undefined> {
  if (input.newRunId === undefined) return undefined;
  const refuse = (message: string): never => {
    ports.refused?.();
    throw new Error(message);
  };
  if (input.runId !== undefined) return refuse("A run is either an existing session (runId) or a new one (newRunId), not both.");
  if (!input.projectId) return refuse("A new run id needs a project: a run outside a project is never stored, so its id could read nothing back.");
  if (typeof input.newRunId !== "string" || !RUN_ID.test(input.newRunId)) return refuse("A new run id must be a lowercase UUID, the form Core gives run ids itself.");
  if (await ports.getRuntimeSession(input.projectId, input.newRunId)) return refuse(`Run ${input.newRunId} already exists in this project; a new run needs an id of its own.`);
  return input.newRunId;
}
