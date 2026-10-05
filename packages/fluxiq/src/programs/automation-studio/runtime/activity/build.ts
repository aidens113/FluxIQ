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
      // "Build finished: a Flow is proposed" said nothing to the person, and the
      // Flow ran a second later (t174-w108 D9, `run-musp8nz1-dbd3905a`).
      emitAutomationStudioActivity({ phase: "done", label: "Your Flow is ready", detail: { kind: "step", title: "Build finished", status: "succeeded" }, final: true });
      return built;
    } catch (error) {
      const ending = buildEndingOf(error);
      const title = ending ? ENDING_TITLES[ending.kind] : "Build failed";
      emitAutomationStudioActivity({ phase: "failed", label: title, detail: { kind: "step", title, status: "failed", ...(ending ? { text: ending.message } : {}) }, final: true });
      throw error;
    }
  });
}

/** The most of the person's words one build's request carries. */
export const AUTOMATION_STUDIO_BUILD_REQUEST_MAX_CHARS = 4_000;

/**
 * Says what the person asked this build, in their own words, once the build
 * has read its instructions: the bodies of the Flow's own instructions, or of
 * every instruction it read when none is the Flow's own. A chat shows it as
 * the person's message (`ClientGatewayActivity.request`). Live runs 34 and 35
 * (`run-mup2i28c-6c7fc209`, `run-muq05kas-058193f0`) were built from an
 * instruction the chat never showed: the person's side of the conversation
 * was empty while FluxIQ worked on it.
 */
export function emitAutomationStudioBuildRequest(instructions: ReadonlyArray<{ body: string; scopeKind: string }>): void {
  const own = instructions.filter((instruction) => instruction.scopeKind === "flow");
  const words = (own.length ? own : instructions).map((instruction) => instruction.body.trim()).filter(Boolean).join("\n\n");
  if (!words) return;
  emitAutomationStudioActivity({ phase: "building", label: "Building the Flow", request: words.slice(0, AUTOMATION_STUDIO_BUILD_REQUEST_MAX_CHARS) });
}

const ENDING_TITLES = Object.freeze({
  not_doable: "Not doable: this Flow could not be built",
  not_finished: "Build stopped: the Flow is not finished yet",
  budget_exhausted: "Build stopped: a budget ran out",
  replies_unreadable: "Build stopped: the model's replies could not be read",
  provider_unavailable: "Build stopped: the AI model provider is not responding"
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
