import type { ClientGatewayActivityPhase } from "@fluxiq/contracts/client-gateway";
import { emitAutomationStudioActivity } from "./emit.ts";
import { runWithAutomationStudioActivity } from "./scope.ts";
import { automationStudioActivityRunEnding } from "./wording/index.ts";

type Settled = { phase: ClientGatewayActivityPhase; label: string; kind: "step" | "ask"; status: "started" | "succeeded" | "failed"; final: boolean };

/** What each settled session status says, and whether it ends the run. */
const SETTLED: Readonly<Record<string, Settled>> = {
  succeeded: { phase: "done", label: "Run finished", kind: "step", status: "succeeded", final: true },
  failed: { phase: "failed", label: "Run failed", kind: "step", status: "failed", final: true },
  cancelled: { phase: "failed", label: "Run cancelled", kind: "step", status: "failed", final: true },
  waiting: { phase: "waiting_permission", label: "Run is waiting for an answer", kind: "ask", status: "started", final: false }
};

type RunRecord = Readonly<Record<string, unknown>>;

type AutomationStudioRunActivityOptions<T> = {
  /**
   * The run's own record (its run detail's metadata) once it settled failed,
   * which is where the result check's verdict and the repair's ending are
   * kept. Read only for a failed run, and never able to fail it: a record
   * that cannot be read leaves the session's own metadata to say what it can.
   */
  readRecord?: (session: T) => Promise<RunRecord | null | undefined>;
};

/**
 * Runs one Flow run as a unit of work. The scope is pending until the session
 * is admitted and `bindAutomationStudioActivityRun` names it; the settled
 * session's status then says `done`, `failed` or `waiting_permission`. A run
 * without a project is run unobserved, and so is one that returns before it
 * is bound (an idempotent repeat returning the session it already started).
 *
 * A failed run's last row says what came back and why the run failed, when
 * its result check is what failed it ("Run failed: It returned 13 rows, but
 * the check found they don't answer what you asked, and the fix ran out of
 * room before it finished.", `./wording/run-ending.ts`): a bare "Run failed"
 * after a four-minute repair told the person nothing (U3,
 * `run-musp39u8-9ac026ab`). The sentence is the label, which the overlay and
 * the live line show, and the row's text, which the chat shows under "Run
 * failed", so both say the same thing.
 */
export async function withAutomationStudioRunActivity<T extends { status: string; metadata?: unknown }>(target: { projectId?: string | null | undefined; flowId?: string | undefined }, fn: () => Promise<T>, options: AutomationStudioRunActivityOptions<T> = {}): Promise<T> {
  if (!target.projectId) return await fn();
  const scope = { kind: "run" as const, id: "", projectId: target.projectId, ...(target.flowId ? { flowId: target.flowId } : {}) };
  return await runWithAutomationStudioActivity(scope, async () => {
    let session: T;
    try {
      session = await fn();
    } catch (error) {
      emitAutomationStudioActivity({ phase: "failed", label: "Run failed", detail: { kind: "step", title: "Run failed", status: "failed" }, final: true });
      throw error;
    }
    const settled = SETTLED[session.status];
    if (!settled) return session;
    const ending = session.status === "failed" ? await failedRunEnding(session, options.readRecord) : undefined;
    emitAutomationStudioActivity({
      phase: settled.phase,
      label: ending ? `${settled.label}: ${ending}` : settled.label,
      detail: { kind: settled.kind, title: settled.label, status: settled.status, ...(ending ? { text: ending } : {}) },
      ...(settled.final ? { final: true } : {})
    });
    return session;
  }, { pending: true });
}

/**
 * The sentence after "Run failed", from the run's record over the session's
 * own metadata; undefined when neither says. The session's metadata answers
 * first, so a record that cannot be read leaves what the session already says.
 */
async function failedRunEnding<T extends { metadata?: unknown }>(session: T, readRecord: AutomationStudioRunActivityOptions<T>["readRecord"]): Promise<string | undefined> {
  const own = session.metadata !== null && typeof session.metadata === "object" && !Array.isArray(session.metadata) ? session.metadata as RunRecord : {};
  let ending = automationStudioActivityRunEnding(own);
  try {
    const record = await readRecord?.(session);
    if (record) ending = automationStudioActivityRunEnding({ ...own, ...record });
  } catch { /* best-effort: the stream must never fail the run it reports */ }
  return ending;
}
