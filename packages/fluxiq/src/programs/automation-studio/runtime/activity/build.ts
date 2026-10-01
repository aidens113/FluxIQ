import { randomUUID } from "node:crypto";
import { emitAutomationStudioActivity } from "./emit.ts";
import { runWithAutomationStudioActivity } from "./scope.ts";

/**
 * Runs one Flow build as a unit of work: `building` when it starts, and
 * `done` or `failed` when it settles. A request without a usable project is
 * run unobserved, since there is no project to report it to.
 *
 * A build that could not finish says why in the chat (t208): "not doable"
 * with its reason, or the budget that ran out, as the message Core wrote for
 * the person (`../flow-bootstrap/generation-failure/build-ending.ts`) rather
 * than the bare "Build failed" 30 live runs ended on (audit A3, cause 1).
 */
export async function withAutomationStudioBuildActivity<T>(target: { projectId?: unknown; flowId?: unknown }, fn: () => Promise<T>): Promise<T> {
  if (typeof target.projectId !== "string" || !target.projectId) return await fn();
  const flowId = typeof target.flowId === "string" && target.flowId ? target.flowId : undefined;
  return await runWithAutomationStudioActivity({ kind: "build", id: `build-${randomUUID()}`, projectId: target.projectId, ...(flowId ? { flowId } : {}) }, async () => {
    emitAutomationStudioActivity({ phase: "building", label: "Building the Flow", detail: { kind: "step", title: "Build started", status: "started", ...(flowId ? { ref: flowId } : {}) } });
    try {
      const built = await fn();
      emitAutomationStudioActivity({ phase: "done", label: "Build finished: a Flow is proposed", detail: { kind: "step", title: "Build finished", status: "succeeded" }, final: true });
      return built;
    } catch (error) {
      const ending = buildEndingOf(error);
      const title = ending ? ENDING_TITLES[ending.kind] : "Build failed";
      emitAutomationStudioActivity({ phase: "failed", label: title, detail: { kind: "step", title, status: "failed", ...(ending ? { text: ending.message } : {}) }, final: true });
      throw error;
    }
  });
}

const ENDING_TITLES = Object.freeze({
  not_doable: "Not doable: this Flow could not be built",
  budget_exhausted: "Build stopped: a budget ran out",
  replies_unreadable: "Build stopped: the model's replies could not be read"
});

/**
 * The ending a failed build carries for the person, read by shape: this module
 * sits under the build and cannot import the failure's class without a cycle.
 */
function buildEndingOf(error: unknown): { kind: keyof typeof ENDING_TITLES; message: string } | undefined {
  const ending = (error as { diagnostic?: { ending?: { kind?: unknown; message?: unknown } } } | null)?.diagnostic?.ending;
  if (!ending || typeof ending.kind !== "string" || !Object.prototype.hasOwnProperty.call(ENDING_TITLES, ending.kind) || typeof ending.message !== "string" || !ending.message) return undefined;
  return { kind: ending.kind as keyof typeof ENDING_TITLES, message: ending.message };
}
