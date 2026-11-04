// What `generate-flow-bootstrap-adaptation` does with a request: refuses what it
// cannot honour before anything runs, runs the build as whoever's unlocked key
// pays, keeps a failed build's diagnostic for a later reader, and answers with
// the build checked field by field.

import { resolveAutomationStudioBuildAuthoringMode } from "../../../../flows/authoring/model/authoring-mode/index.ts";
import type { GenerateFlowBootstrapAdaptationRequest, GenerateFlowBootstrapAdaptationResponse } from "../../../../api-contracts/automation.ts";
import type { AutomationStudioGenerateFlowBootstrapAdaptationResult } from "../flow-bootstrap-commands/index.ts";
// Values come from their owning modules, not the runtime barrel: through the barrel a load order
// reached llm-generation before generation-failure finished loading, and its builders read undefined
// (sweep-1008: twelve runtime-execution tests). Types erase, so they may stay on the barrel.
import { parseAutomationStudioPermittedConsequences, type AutomationStudioActionConsequence } from "../../../../runtime/action-permission-requests/index.ts";
import { AUTOMATION_STUDIO_FLOW_BOOTSTRAP_PERMISSION_ASK_TIMEOUT_MS, automationStudioFlowStartLocation } from "../../../../runtime/flow-authoring/bootstrap/index.ts";
import { parseAutomationStudioFlowBootstrapGenerationError, type AutomationStudioFlowBootstrapFailedBuilds } from "../../../../runtime/flow-authoring/bootstrap/generation-failure/index.ts";
import type { AutomationStudioService } from "../../service.ts";
import { trackAutomationStudioTaskAttempt } from "../answer-first/attempt-in-flight/index.ts";
import { automationStudioAnswerFirstSetupOf } from "../answer-first/setup/index.ts";
import { boundedIdentifier } from "./bounded-identifier.ts";
import { flowBootstrapGenerationReadiness } from "./readiness.ts";
import { sanitizedFlowBootstrapGeneration } from "./sanitized-generation.ts";

const FLOW_BOOTSTRAP_GENERATION_REQUEST_FIELDS = new Set([
  "projectId",
  "flowId",
  "authSessionId",
  "conversationId",
  "permittedConsequences",
  "evidenceGuided",
  "authoringMode",
  "useReusableContext",
  "startLocation",
  "mode",
  "interpretationCostUsd",
  "interpretationCalls"
]);

function flowBootstrapRuntimeUnavailable(readiness: ReturnType<typeof flowBootstrapGenerationReadiness>) {
  return { ok: false, error: "Flow bootstrap generation runtime is unavailable.", payload: { readiness } } as const;
}

/** Whether the thread that asked is noted. A failure is the caller's to say, and a host with no way to note one has none to report. */
async function threadNoted(note: ((projectId: string, conversationId: string, flowId: string) => Promise<void>) | undefined, projectId: string, conversationId: string, flowId: string): Promise<boolean> {
  try {
    await note?.(projectId, conversationId, flowId);
    return true;
  } catch {
    return false;
  }
}

export async function generateFlowBootstrapAdaptationForRequest(
  dependencies: {
    service: Pick<AutomationStudioService, "generateFlowBootstrapAdaptation" | "getFlowBootstrapGenerationRuntimeReadiness">;
    failedBuilds: AutomationStudioFlowBootstrapFailedBuilds<NonNullable<ReturnType<typeof parseAutomationStudioFlowBootstrapGenerationError>>>;
    /** Notes that a chat thread holds this Flow, so it can read back the attempt it asked for. */
    noteConversation?: (projectId: string, conversationId: string, flowId: string) => Promise<void>;
  },
  request: { payload?: unknown; actor?: { userId: string; sessionId: string } }
) {
  const { service, failedBuilds } = dependencies;
  if (!request.actor) return { ok: false, error: "Flow bootstrap generation is unavailable." };
  const payload = request.payload && typeof request.payload === "object" && !Array.isArray(request.payload)
    ? request.payload as Partial<GenerateFlowBootstrapAdaptationRequest> & Record<string, unknown>
    : {};
  const unknownField = Object.keys(payload).find((key) => !FLOW_BOOTSTRAP_GENERATION_REQUEST_FIELDS.has(key));
  if (unknownField) return { ok: false, error: "Flow bootstrap generation request contains unsupported fields." };
  if (payload.evidenceGuided !== undefined && payload.evidenceGuided !== true) return { ok: false, error: "Flow bootstrap generation request contains an invalid evidence-guided flag." };
  // `answer-first` by name is this file's alone: the API contract keeps its own list, and the chat reaches this mode through `configured`.
  const askedMode: unknown = payload.authoringMode;
  if (askedMode !== undefined && ((askedMode !== "candidate" && askedMode !== "project" && askedMode !== "configured" && askedMode !== "answer-first") || payload.evidenceGuided !== true)) return { ok: false, error: "Candidate authoring requires evidence-guided generation." };
  // `configured` is how a client that cannot read Core's configuration
  // (the web panel) asks for Core's own authoring mode
  // (`../../model/authoring-mode/`); it is resolved here, once, so the build
  // and the answer below agree on it. An extend resolves to a mode that can
  // extend, as the chat's improve does (`resolveAutomationStudioBuildAuthoringMode`);
  // `project` asked for by name is forwarded as asked.
  let candidateAuthoring: "candidate" | "project" | "answer-first" | undefined;
  try {
    const mode = askedMode === "configured" ? resolveAutomationStudioBuildAuthoringMode(payload.mode === "extend" ? "extend" : "create") : askedMode;
    // An extend asked for by name in answer-first mode builds as a candidate, as a `configured` one resolves.
    candidateAuthoring = mode === "answer-first" && payload.mode === "extend" ? "candidate" : mode === "candidate" || mode === "project" || mode === "answer-first" ? mode : undefined;
  }
  catch (error) { return { ok: false, error: error instanceof Error ? error.message : "Core's authoring mode is misconfigured." }; }
  if (payload.useReusableContext !== undefined && payload.useReusableContext !== true) return { ok: false, error: "Flow bootstrap generation request contains an invalid reusable-context flag." };
  // `extend` improves the Flow as it stands instead of writing one from
  // nothing. Only the two words Core knows pass; absent is `create`, which
  // is what every caller that predates the field has always meant.
  if (payload.mode !== undefined && payload.mode !== "create" && payload.mode !== "extend") return { ok: false, error: "Flow bootstrap generation request contains an invalid mode." };
  // Refused here rather than carried: a build that lost the one thing
  // telling it where its Flow starts would explore from nowhere.
  let startLocation: string | undefined;
  try { startLocation = automationStudioFlowStartLocation(payload.startLocation); }
  catch { return { ok: false, error: "Flow bootstrap generation request contains an invalid start location." }; }
  // What the chat's reading of the message cost, carried into the Flow's
  // creation purse. Only a finite, non-negative amount passes.
  const interpretationCostUsd = payload.interpretationCostUsd;
  if (interpretationCostUsd !== undefined && (typeof interpretationCostUsd !== "number" || !Number.isFinite(interpretationCostUsd) || interpretationCostUsd < 0)) return { ok: false, error: "Flow bootstrap generation request contains an invalid interpretation cost." };
  const interpretationCalls = payload.interpretationCalls;
  if (interpretationCalls !== undefined && (!Number.isSafeInteger(interpretationCalls) || (interpretationCalls as number) < 0)) return { ok: false, error: "Flow bootstrap generation request contains an invalid interpretation call count." };
  const readiness = flowBootstrapGenerationReadiness(service);
  if (!readiness.supported) return flowBootstrapRuntimeUnavailable(readiness);
  // What the person allowed the build's actions to do. Absent is nothing;
  // a class Core does not know refuses the request rather than being
  // dropped, so a build never runs holding less than was asked for.
  let permittedConsequences: AutomationStudioActionConsequence[];
  try { permittedConsequences = parseAutomationStudioPermittedConsequences(payload.permittedConsequences); }
  catch { return { ok: false, error: "Flow bootstrap generation request contains invalid permitted consequences." }; }
  if (payload.authSessionId !== request.actor.sessionId) return { ok: false, error: "Authorization session mismatch." };
  const projectId = boundedIdentifier(payload.projectId, "Project");
  const flowId = boundedIdentifier(payload.flowId, "Flow");
  const conversationId = payload.conversationId === undefined ? undefined : boundedIdentifier(payload.conversationId, "Conversation");
  // Before the attempt starts, so a thread lists its working row. A note not written costs the thread its card and must not cost the person the task, so the answer says so and the attempt runs.
  const threadNotNoted = candidateAuthoring === "answer-first" && conversationId !== undefined && !(await threadNoted(dependencies.noteConversation, projectId, conversationId, flowId));
  let generated: AutomationStudioGenerateFlowBootstrapAdaptationResult;
  // An answer-first attempt counts as work in flight for its whole length, waiting on a person included (`../answer-first/attempt-in-flight/`).
  const actor = request.actor; // Narrowed above; the closure below does not keep that.
  const counted = <T>(run: () => Promise<T>): Promise<T> => candidateAuthoring === "answer-first" ? trackAutomationStudioTaskAttempt(service, run) : run();
  try {
    generated = await counted(() => service.generateFlowBootstrapAdaptation({
      projectId,
      flowId,
      // Whose key pays for the build's model calls. Not an authorization,
      // and not a fixed key handle: the session is the one the build
      // started from, which each call tries first before the person's
      // other live unlocks (`runtime/llm/session-key-provider.ts`). A
      // sign-out of it mid-build no longer fails the build while another
      // unlock of theirs lives; with none, the next call is `secrets.locked`.
      caller: { actorUserId: actor.userId, actorSessionId: actor.sessionId },
      // A build that meets an act outside these asks the person; empty
      // permits nothing lasting.
      permittedConsequences,
      ...(payload.evidenceGuided === true ? { evidenceGuided: true as const } : {}),
      ...(candidateAuthoring ? { authoringMode: candidateAuthoring } : {}),
      ...(payload.useReusableContext === true ? { useReusableContext: true as const } : {}),
      ...(payload.mode === "extend" ? { mode: "extend" as const } : {}),
      // Where the Flow starts, when the caller named one. Validated above,
      // so a request that named an unusable one was already refused rather
      // than built from nowhere.
      ...(startLocation === undefined ? {} : { startLocation }),
      ...(interpretationCostUsd === undefined ? {} : { interpretationCostUsd }),
      ...(interpretationCalls === undefined ? {} : { interpretationCalls: interpretationCalls as number }),
      // Somebody has just pressed build, so a question this build raises is
      // worth holding it open for: answered, the build carries on with
      // permission instead of coming back needing another one.
      permissionAskTimeoutMs: AUTOMATION_STUDIO_FLOW_BOOTSTRAP_PERMISSION_ASK_TIMEOUT_MS
    }));
  } catch (error) {
    if ((error as { name?: string } | null)?.name === "AbortError") {
      const diagnostic = parseAutomationStudioFlowBootstrapGenerationError((error as { cause?: unknown }).cause);
      failedBuilds.ended(projectId, flowId, diagnostic ?? undefined);
      return { ok: false, error: "Build stopped. The Flow was not promoted.", payload: { cancelled: true, ...(diagnostic ? { diagnostic } : {}) } };
    }
    const diagnostic = parseAutomationStudioFlowBootstrapGenerationError(error);
    failedBuilds.ended(projectId, flowId, diagnostic ?? undefined);
    if (diagnostic) {
      return {
        ok: false,
        error: `Flow Bootstrap generation failed (${diagnostic.code}).`,
        payload: { diagnostic }
      };
    }
    return { ok: false, error: "Flow Bootstrap generation failed (flow_bootstrap.unclassified_failure)." };
  }
  failedBuilds.ended(projectId, flowId, undefined);
  // An attempt's answer is a normal return however it ended (`../answer-first/`), and its records were each parsed by the contract as it ended; the Flow is untouched, so nothing here is a change to review. The API contract's list stays as it is: the chat reads this by its own shape (`runtime/conversations/commands/build.ts`).
  if (generated.status === "answered") return candidateAuthoring === "answer-first" ? { ok: true, payload: threadNotNoted ? { answered: generated, threadNotNoted } : { answered: generated } } : { ok: false, error: "Flow bootstrap generation returned a status inconsistent with the requested authoring mode." };
  // What a person must do before an attempt can start: no attempt began, and nothing failed (`../answer-first/setup/`).
  const setupNeeded = automationStudioAnswerFirstSetupOf(generated);
  if (setupNeeded) return candidateAuthoring === "answer-first" ? { ok: true, payload: { setupNeeded } } : { ok: false, error: "Flow bootstrap generation returned a status inconsistent with the requested authoring mode." };
  // Candidate mode ends as a draft or, after a trial judged yes twice, as a proposal naming that candidate and trial (t340); legacy mode only ever proposes, and never names a candidate.
  const consistent = candidateAuthoring ? generated.status === "draft" || generated.candidate !== undefined : generated.status === "proposed" && generated.candidate === undefined;
  if (!consistent) return { ok: false, error: "Flow bootstrap generation returned a status inconsistent with the requested authoring mode." };
  const sanitized = sanitizedFlowBootstrapGeneration(generated as GenerateFlowBootstrapAdaptationResponse);
  return { ok: true, payload: sanitized.status === "draft" ? { candidate: sanitized } : { adaptation: sanitized } };
}
