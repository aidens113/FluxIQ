import { randomUUID } from "node:crypto";
import { emitAutomationStudioActivity } from "./emit.ts";
import { runWithAutomationStudioActivity } from "./scope.ts";

/**
 * Runs one Flow build as a unit of work: `building` when it starts, and
 * `done` or `failed` when it settles. A request without a usable project is
 * run unobserved, since there is no project to report it to.
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
      emitAutomationStudioActivity({ phase: "failed", label: "Build failed", detail: { kind: "step", title: "Build failed", status: "failed" }, final: true });
      throw error;
    }
  });
}
