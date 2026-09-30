import type { ClientGatewayActivityPhase } from "@fluxiq/contracts/client-gateway";
import { emitAutomationStudioActivity } from "./emit.ts";
import { runWithAutomationStudioActivity } from "./scope.ts";

type Settled = { phase: ClientGatewayActivityPhase; label: string; kind: "step" | "ask"; status: "started" | "succeeded" | "failed"; final: boolean };

/** What each settled session status says, and whether it ends the run. */
const SETTLED: Readonly<Record<string, Settled>> = {
  succeeded: { phase: "done", label: "Run finished", kind: "step", status: "succeeded", final: true },
  failed: { phase: "failed", label: "Run failed", kind: "step", status: "failed", final: true },
  cancelled: { phase: "failed", label: "Run cancelled", kind: "step", status: "failed", final: true },
  waiting: { phase: "waiting_permission", label: "Run is waiting for an answer", kind: "ask", status: "started", final: false }
};

/**
 * Runs one Flow run as a unit of work. The scope is pending until the session
 * is admitted and `bindAutomationStudioActivityRun` names it; the settled
 * session's status then says `done`, `failed` or `waiting_permission`. A run
 * without a project is run unobserved, and so is one that returns before it
 * is bound (an idempotent repeat returning the session it already started).
 */
export async function withAutomationStudioRunActivity<T extends { status: string }>(target: { projectId?: string | null | undefined; flowId?: string | undefined }, fn: () => Promise<T>): Promise<T> {
  if (!target.projectId) return await fn();
  const scope = { kind: "run" as const, id: "", projectId: target.projectId, ...(target.flowId ? { flowId: target.flowId } : {}) };
  return await runWithAutomationStudioActivity(scope, async () => {
    try {
      const session = await fn();
      const settled = SETTLED[session.status];
      if (settled) emitAutomationStudioActivity({ phase: settled.phase, label: settled.label, detail: { kind: settled.kind, title: settled.label, status: settled.status }, ...(settled.final ? { final: true } : {}) });
      return session;
    } catch (error) {
      emitAutomationStudioActivity({ phase: "failed", label: "Run failed", detail: { kind: "step", title: "Run failed", status: "failed" }, final: true });
      throw error;
    }
  }, { pending: true });
}
