import { randomUUID } from "node:crypto";
import { activitySaidOnce, cutAtWord } from "../../../../ui/index.ts";
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
      // A build that kept only a draft built no Flow, so it never says one is ready (G2): it ends failed, as the chat says it.
      if (endedAsDraft(built)) {
        emitAutomationStudioActivity({ phase: "failed", label: DRAFT_TITLE, detail: { kind: "step", title: DRAFT_TITLE, status: "failed", text: DRAFT_TEXT }, final: true });
        return built;
      }
      // "Build finished: a Flow is proposed" said nothing to the person, and the
      // Flow ran a second later (t174-w108 D9, `run-musp8nz1-dbd3905a`).
      emitAutomationStudioActivity({ phase: "done", label: "Your Flow is ready", detail: { kind: "step", title: "Build finished", status: "succeeded" }, final: true });
      return built;
    } catch (error) {
      const ending = buildEndingOf(error);
      // A cancelled build ends in the AbortError its cancellation throws
      // (`../service/flow-bootstrap-commands/cancellation.ts`): that, not a label, is what says it was stopped.
      const stopped = (error as { name?: string } | null)?.name === "AbortError";
      const cause = stopped || ending ? undefined : await buildFailureCause(error);
      // Cut where a word ends, within the stream's bound, so the bound's own cut by count never splits a word (t753).
      const title = stopped ? "Build stopped" : ending ? ENDING_TITLES[ending.kind] : cause ? cutAtWord(`Build failed: ${cause}`, TITLE_MAX) : "Build failed";
      const text = ending ? ending.message : cause ? `${cause.charAt(0).toUpperCase()}${cause.slice(1)}.` : undefined;
      emitAutomationStudioActivity({ phase: "failed", label: title, detail: { kind: "step", title, status: "failed", ...(text ? { text } : {}) }, final: true, ...(stopped ? { stopped: true as const } : {}) });
      throw error;
    }
  });
}

/**
 * Whether a build's answer is a draft: a candidate kept unverified, which puts
 * nothing into the Flow (`../service/flow-bootstrap-commands/contracts.ts`,
 * `status: "draft"`). Read by shape: this module sits under the build. Social
 * `run-mvfq957o-40103539` (G2) showed "Your Flow is ready" beside a chat that
 * said no Flow was built.
 */
function endedAsDraft(built: unknown): boolean {
  return Boolean(built) && typeof built === "object" && (built as { status?: unknown }).status === "draft";
}

/** What the activity says of a build that kept only a draft (G2). */
const DRAFT_TITLE = "Build ended: no Flow was built";
const DRAFT_TEXT = "What it wrote is kept as a draft, and nothing was put into the Flow.";

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
  // A person's words, as the ending under it says it (`../flow-bootstrap/unfinished-build/replies-unreadable.ts`).
  replies_unreadable: "Build stopped: the replies it got back could not be read",
  provider_unavailable: "Build stopped: the AI model provider is not responding"
});

/** How the chat's ending opens a build's failure, which the overlay's line leaves out under its "Build failed". */
const CHAT_OPENING = /^the build failed: /u;

/**
 * Why a build with no ending of its own failed, in the words the chat's ending
 * says it (`../conversations/commands/progress.ts`): R4a's overlay read a bare
 * "Build failed" while the chat said "The build failed: it kept trying without
 * getting any further, so it was stopped" (`run-mv2nlh9l-52e476da`, moment 10).
 * The failure is read as the build's API answers it -- its diagnostic, and the
 * error's message, which carries only the code -- so both say the same.
 * Nothing for a throw that is not a build's own.
 *
 * Loaded when a build fails, never at start: the conversation and the build's
 * failure sit above this module, which everything that reports activity
 * imports, and a dynamic import is no edge of the module graph.
 */
async function buildFailureCause(error: unknown): Promise<string | undefined> {
  const [{ parseAutomationStudioFlowBootstrapGenerationError }, { automationStudioConversationCallCause }] = await Promise.all([
    import("../flow-bootstrap/generation-failure/index.ts"),
    import("../conversations/commands/index.ts")
  ]);
  const diagnostic = parseAutomationStudioFlowBootstrapGenerationError(error);
  if (!diagnostic) return undefined;
  const said = automationStudioConversationCallCause("the build", { ok: false, error: (error as Error).message, payload: { diagnostic } });
  // A supervisor's ending and its reason can say one thing twice: "FluxIQ could not finish the Flow: I could not finish this" (t753).
  return CHAT_OPENING.test(said) ? activitySaidOnce(said.replace(CHAT_OPENING, "")) : undefined;
}

/** The stream's bound on a label and a title (`./bounded.ts`), which it cuts to by count. */
const TITLE_MAX = 160;

/**
 * The ending a failed build carries for the person, read by shape: this module
 * sits under the build and cannot import the failure's class without a cycle.
 */
function buildEndingOf(error: unknown): { kind: keyof typeof ENDING_TITLES; message: string } | undefined {
  const ending = (error as { diagnostic?: { ending?: { kind?: unknown; message?: unknown } } } | null)?.diagnostic?.ending;
  if (!ending || typeof ending.kind !== "string" || !Object.prototype.hasOwnProperty.call(ENDING_TITLES, ending.kind) || typeof ending.message !== "string" || !ending.message) return undefined;
  return { kind: ending.kind as keyof typeof ENDING_TITLES, message: ending.message };
}
