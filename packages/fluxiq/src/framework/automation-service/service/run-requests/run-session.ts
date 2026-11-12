// What `run-runtime-session` does with a request: reads what the caller asked
// the run to be, runs it as whoever's unlocked key pays, and answers with the
// run's session and what its stored detail says came of it.

import { humannessSchema } from "@fluxiq/contracts/automation";
import { AUTOMATION_STUDIO_ENDPOINTS } from "../../../../api-contracts/automation.ts";
import { automationStudioWithWholeAttemptInputs } from "../../../../engine/automation/node-execution/index.ts";
import type { AutomationStudioFlowRunDetail } from "../../../../flows/authoring/model/index.ts";
import { parseAutomationStudioPermittedConsequences, type AutomationStudioActionConsequence } from "../../../../runtime/action-permission-requests/index.ts";
import { automationStudioRunChangedDurableBehavior } from "../../../../runtime/adaptation/durable-behavior/index.ts";
import { AUTOMATION_STUDIO_RESULT_REAUTHOR_METADATA_KEY } from "../../../../runtime/adaptation/recovery/index.ts";
import { AUTOMATION_STUDIO_RUNTIME_SESSION_LLM_INTENTS, type AutomationStudioRuntimeSessionLlm } from "../../../../runtime/llm/index.ts";
import type { AutomationStudioService } from "../../service.ts";
import type { AutomationStudioRuntimeSessionRunInput } from "../runtime-session/index.ts";
import { automationStudioRunRefusalResponse } from "./refusal-response.ts";

/**
 * The run input fields a `run-runtime-session` body may set as it sent them,
 * each still checked where the run reads it. Every other field of the input is
 * either read and checked here (intent, permitted consequences, who pays for
 * result checks, the reading's cost and calls, humanness) or Core's own to set:
 * `llmExecution` comes from the signed-in caller alone.
 */
const RUN_REQUEST_FIELDS = ["projectId", "commandOutcomeMode", "runId", "newRunId", "flow", "flowId", "inputs", "maxSteps", "authorizedDomainIds", "adaptiveMode", "dryRunLlm", "authorizedExternalSideEffects", "subflowId", "idempotencyKey", "useReusableContext"] as const satisfies ReadonlyArray<keyof AutomationStudioRuntimeSessionRunInput>;
type RunRequestFields = Pick<AutomationStudioRuntimeSessionRunInput, (typeof RUN_REQUEST_FIELDS)[number]>;

export async function runRuntimeSessionForRequest(
  service: Pick<AutomationStudioService, "runRuntimeSession" | "getFlowRunDetail" | "conversations">,
  request: { payload?: unknown; actor?: { userId: string; sessionId: string } }
) {
  const body = request.payload && typeof request.payload === "object" ? request.payload as Record<string, unknown> : {};
  if (body.useReusableContext !== undefined && body.useReusableContext !== true) return { ok: false, error: "Runtime reusable-context flag is invalid." };
  // Only the fields named in `RUN_REQUEST_FIELDS` reach the run as sent; the
  // ones read below are checked first, and anything else the body carries is
  // dropped. Whose key pays and acts (`llmExecution`) is never read from it.
  const payload: RunRequestFields = {};
  for (const field of RUN_REQUEST_FIELDS) if (body[field] !== undefined) Object.assign(payload, { [field]: body[field] });
  const { runIntent: requestedIntent, permittedConsequences: requestedConsequences, resultCheckCallerPays: requestedCallerPays, interpretationCostUsd: readingCost, interpretationCalls: readingCalls, humanness: requestedHumanness } = body;
  // What the chat's reading of the message that started the run cost (the chat's "Run it"): the Flow's spend in a Lab-scoped run (t438).
  if (readingCost !== undefined && (typeof readingCost !== "number" || !Number.isFinite(readingCost) || readingCost < 0)) return { ok: false, error: "The run's interpretation cost is invalid." };
  if (readingCalls !== undefined && (!Number.isSafeInteger(readingCalls) || (readingCalls as number) < 0)) return { ok: false, error: "The run's interpretation call count is invalid." };
  // How human the person wants the run to act (the chat's "Run it", the panel's Run): refused unless a whole number from 0 to 100.
  if (requestedHumanness !== undefined && !humannessSchema.safeParse(requestedHumanness).success) return { ok: false, error: "The run's humanness must be a whole number from 0 to 100." };
  // A caller may ask to pay for fewer of its run's result checks, never more: the chat's "Run it" for a
  // paired client calls as the person's unlocked session, so it says itself what the paired rule below says.
  if (requestedCallerPays !== undefined && requestedCallerPays !== "repair_checks") return { ok: false, error: "A run can only ask to pay for the result checks that judge a repair." };
  // Every intent a runtime session runs under, named in one place, so
  // `explore_and_adapt` is reachable from a failed run rather than being a
  // capability nothing could ask for. The intent says what the run is for;
  // the signed-in actor is whose unlocked key pays for its model calls.
  let llmExecution: AutomationStudioRuntimeSessionLlm | undefined;
  let pairedCaller = false;
  if (requestedIntent !== undefined) {
    const intent = AUTOMATION_STUDIO_RUNTIME_SESSION_LLM_INTENTS.find((candidate) => candidate === requestedIntent);
    if (!intent) return { ok: false, error: "The run intent is not one Core supports." };
    if (!request.actor) return { ok: false, error: "A run the model takes part in needs a signed-in person." };
    // A paired client -- the extension's Automations Run -- calls as
    // `client-gateway:<id>`, a session Secret Keys never releases a key to,
    // so its model always ran keyless. It is mapped to the approving
    // person's unlocked session the way a chat turn is
    // (`runtime/conversations/commands/caller.ts`): whose key pays changes,
    // never what may be done. With no unlocked session the Flow runs
    // deterministically, exactly as it did before, rather than being
    // refused. A person's own session passes through unchanged.
    // `actorSessionId` is the session each model call tries first, not the
    // one that pays for the whole run: every call resolves the person's live
    // unlock again (`runtime/llm/session-key-provider.ts`), so a sign-out of
    // that session mid-run falls back to another unlock of theirs, and with
    // none the call fails with `secrets.locked`.
    const caller = service.conversations.callerFor(request.actor);
    if (!caller.keyLocked) llmExecution = { actorUserId: caller.userId, actorSessionId: caller.preferredSessionId ?? caller.sessionId, intent };
    pairedCaller = caller.paired;
  }
  // What the person allowed the run's actions to do. Absent is nothing; a
  // class Core does not know refuses the run rather than being dropped.
  let permittedConsequences: AutomationStudioActionConsequence[] | undefined;
  try { permittedConsequences = requestedConsequences === undefined ? undefined : parseAutomationStudioPermittedConsequences(requestedConsequences); }
  catch { return { ok: false, error: "The run's permitted consequences name a class Core does not recognise." }; }
  // A run may name the run it is continuing (t166): a repair that must
  // resume the run that failed has to be able to say which run that was.
  // `newRunId` is a different field: it names the session the run is about
  // to create, so the caller can read the run back if its own request is cut
  // short (`runtime/service/runtime-session/requested-run-id.ts`).
  // The paired person's key pays only for the result checks that judge a
  // repair; an Automations Run's routine checks are sampled under the
  // Flow's standing authorization, or not at all (MVP item 23). A person's
  // own session pays for every check its run makes, as it always has, unless
  // it asked for the paired rule itself (the chat's "Run it").
  const resultCheckCallerPays = llmExecution && (pairedCaller || requestedCallerPays === "repair_checks") ? { resultCheckCallerPays: "repair_checks" as const } : {};
  // A saved trace keeps each value once; a client reads every attempt's whole inputs (t377).
  // A run refused before its first step answers with its closed code (`./refusal-response.ts`).
  let ran: Awaited<ReturnType<typeof service.runRuntimeSession>>;
  try {
    ran = await service.runRuntimeSession({ ...payload, ...(llmExecution ? { llmExecution } : {}), ...(permittedConsequences ? { permittedConsequences } : {}), ...resultCheckCallerPays, ...(readingCost === undefined ? {} : { interpretationCostUsd: readingCost }), ...(readingCalls === undefined ? {} : { interpretationCalls: readingCalls as number }), ...(requestedHumanness === undefined ? {} : { humanness: requestedHumanness as number }), ...(request.actor?.userId ? { personUserId: request.actor.userId } : {}) });
  } catch (error) {
    const refusal = automationStudioRunRefusalResponse(error);
    if (refusal) return refusal;
    throw error;
  }
  const runtimeSession = automationStudioWithWholeAttemptInputs(ran);
  const projectId = typeof payload.projectId === "string" ? payload.projectId : null;
  const runDetailLink = { endpoint: AUTOMATION_STUDIO_ENDPOINTS.getFlowRunDetail, runId: runtimeSession.runId };
  let runDetail: AutomationStudioFlowRunDetail | null = null;
  try {
    runDetail = projectId ? await service.getFlowRunDetail(projectId, runtimeSession.runId) : null;
  } catch (error) {
    // The run has ended, so its session and link still go back. An unread detail makes this a
    // failed answer, never one that reports no adaptations and no durable change.
    const reason = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `Run ${runtimeSession.runId} ended ${runtimeSession.status}, but its run detail could not be read: ${reason}`, payload: { runtimeSession, runDetailLink } };
  }
  // The same reading every stored run summary carries, so this answer and `list-flow-runs` agree.
  const durableBehaviorChanged = runDetail ? automationStudioRunChangedDurableBehavior(runDetail) : false;
  return {
    ok: true,
    payload: {
      runtimeSession,
      runSummary: runDetail?.summary,
      runDetailLink,
      createdAdaptationIds: runDetail?.adaptationIds ?? [],
      interventionCount: runDetail?.summary.interventionCount ?? 0,
      terminalReason: runtimeSession.trace?.message ?? runtimeSession.status,
      durableBehaviorChanged,
      ...reauthoredOf(runDetail)
    }
  };
}

/**
 * How the run's re-author settled, in a closed word: `applied` once a whole
 * re-run with the re-authored Flow was judged to answer and the edit was kept,
 * `not_applied` once it was settled otherwise (t267 S4,
 * `runtime/service/runtime-adaptation/judged-reauthor.ts`). A re-author is a
 * Flow Bootstrap adaptation, so it is not among `createdAdaptationIds`; the
 * chat's "run it" says it apart (`runtime/conversations/commands/run-flow.ts`).
 * Read from the marker's own settled fields, never its codes or attempts;
 * nothing when the run re-authored nothing or its re-author is not settled.
 */
function reauthoredOf(detail: AutomationStudioFlowRunDetail | null): { reauthored?: "applied" | "not_applied" } {
  const marker = detail?.metadata?.[AUTOMATION_STUDIO_RESULT_REAUTHOR_METADATA_KEY];
  if (!marker || typeof marker !== "object" || Array.isArray(marker) || typeof marker.adaptationId !== "string") return {};
  if (marker.applied === true) return { reauthored: "applied" };
  return typeof marker.notAppliedReason === "string" ? { reauthored: "not_applied" } : {};
}
