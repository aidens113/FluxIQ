// Every evidence loop's hand-off of a check to the person, written once.
//
// **The rule.** FluxIQ never presses, types into or solves a check that asks
// whether it is a person, and no model is ever shown a call that met one. A
// domain that meets one says so on its call (`personNeeded` on the tool result,
// `../llm/evidence-loop/tool-execution.ts`), and this wraps the executor a loop
// is handed so that such a result never reaches the loop as it stands: a model
// told "that failed, try again" knocks on the check until the site locks it out
// (`run-munp80f5-c31ea417`), and a repair model shown one would try to act on
// it.
//
// **Two loops, one wrapper.** A build (`../flow-bootstrap/person-needed.ts`)
// and a recovery's exploration (`../recovery/runtime-exploration.ts`) both
// drive the evidence loop against a live target, and both used to be able to
// meet a check. What differs between them is only how each ends and what it
// calls itself; the question, the wait, the bound and the fresh look are the
// same, so they live here and each caller keeps its own ending.
//
// **What happens.** The person-needed question goes into the thread through
// the parking port the caller already holds for permission questions, raised
// at the caller's stage, and the loop waits where it stands. On Continue the
// call stands as the domain described it once cleared -- its `draft`,
// `effectApplied` and `nodeId` -- and its evidence is replaced by a fresh look
// at the target, under a note that says a person completed a check here. A
// look whose answer is an object is the call's answer, keys and all, so it is
// the loop's current view (`../llm/decision-context/current-view.ts`, which
// reads the domain's declared view keys at the top of an answer): nested under
// `now`, as it was, the model's current view stayed the page from before the
// checked call, and a decision read handles off a page that was gone (scripted
// pair `run-mwa3kh87-d34c2f04`: a detection after a cleared sort was refused
// `target_unobserved`). Only a look that is not an object stays under `now`. A
// call whose draft says it went out stands as having acted, whatever
// `effectApplied` said of the moment the check stopped it: a domain reports that
// call as the refusal it was (run `run-mw0jw263-0251c104`, where a Next page that
// moved the list stood as `did_not_work`, out of the Flow, and was refused as
// changing nothing when the model asked for it again). On
// anything else -- Stop, nobody answering, no port to ask through, a port that
// could not be written -- the wrapper aborts its signal and throws, so the
// loop stops at its next turn without asking the model anything, and the
// caller reads `ended()` for why.
//
// **Bounded by a check that stays, never by checks a person cleared.** At most
// `maxAsks` questions in a row with nothing between them getting past a check:
// the person said Continue and the look, or the next call, met a check again.
// That is a check nobody is clearing, and past the bound the work ends the same
// way. A call that comes back without one -- the look after Continue, or any
// later call -- shows the person got past it, and the count starts again. It
// used to count every question the wrapper ever put, so a site that raises a
// fresh check every few loads, each one cleared, ran the bound out on its
// fourth: that call was never put to anyone, it threw, the round ended with the
// check left on the page, and the next round began again from there
// (`run-mwa19obz-abd5d558`, steps 0066-0080). `asks()` still counts every
// question, for the record.
//
// **Kept free of activity.** The caller says what the person sees happening:
// the wait and how it ended, by wrapping the port it hands in
// (`../activity/ask/port.ts`), and anything else through `onAsk` and
// `onCleared`. `../activity/` reads this directory's constants, and a value
// import back from here would close a module cycle.

import type { JsonObject, JsonValue } from "../../core/index.ts";
import type { AutomationStudioLlmEvidenceLoopInput, AutomationStudioLlmEvidenceTool, AutomationStudioLlmEvidenceToolExecutionResult } from "../llm/index.ts";
import type { AutomationStudioAsk, AutomationStudioAskStage } from "../interaction/index.ts";
import { automationStudioAskedPersonNeeded, automationStudioPersonNeededAsk, automationStudioPersonNeededAskDraft, type AutomationStudioPersonNeededOutcome } from "../parking/index.ts";
import type { AutomationStudioParkingPort } from "../parking/index.ts";

/** How many times in a row one piece of work may put the question about a check that stays (header). */
export const AUTOMATION_STUDIO_PERSON_NEEDED_MAX_ASKS = 3;

/** Why work stopped for a person: how the last question came out, or the bound. */
export type AutomationStudioPersonNeededEnding = Exclude<AutomationStudioPersonNeededOutcome, "done"> | "asks_exhausted";

/** Each ending as the one issue code a build's or a recovery's record carries. */
export const AUTOMATION_STUDIO_PERSON_NEEDED_ISSUE_CODES: Readonly<Record<AutomationStudioPersonNeededEnding, string>> = Object.freeze({
  stopped: "person_needed.stopped",
  timed_out: "person_needed.timed_out",
  unreachable: "person_needed.no_thread",
  cancelled: "person_needed.cancelled",
  asks_exhausted: "person_needed.asks_exhausted"
});

/**
 * What the model is told in place of the call's own evidence, once the person
 * has completed the check: the step stands, and what of the target it is shown
 * with it (header).
 */
const STANDS = "This step met a check only a person can complete. FluxIQ handed it to the person, who completed it and pressed Continue, so the step stands and is not to be done again.";
const NEVER = "Never press, type into or reload a check.";
const PERSON_COMPLETED_NOTE = `${STANDS} The rest of this answer is a fresh look at the target as it is after that. ${NEVER}`;
const PERSON_COMPLETED_NOTE_NOW = `${STANDS} \`now\` is a fresh look at the target as it is after that. ${NEVER}`;
const PERSON_COMPLETED_NOTE_NO_LOOK = `${STANDS} ${NEVER}`;

type ExecuteTool = AutomationStudioLlmEvidenceLoopInput["executeTool"];
type ToolCall = Parameters<ExecuteTool>[0];

export type AutomationStudioPersonNeededToolCalls = {
  /** The executor the loop is handed: the inner one, with every person-needed result put to a person first. */
  executeTool: ExecuteTool;
  /** Aborted when the work has to end because the person did not get past a check. The loop runs under it. */
  signal: AbortSignal;
  /** Why the work stopped for a person, or `undefined` when it did not. */
  ended(): AutomationStudioPersonNeededEnding | undefined;
  /** How many questions were put to a person, whatever they answered. */
  asks(): number;
};

/**
 * The call id the fresh look after a cleared check runs under: the call's own,
 * suffixed. A caller that keeps what each call returned reads the look's under
 * the call it stands in for.
 */
export function automationStudioPersonNeededLookCallId(callId: string): string {
  return `${callId}.look`;
}

/** Only the literal `true` on an execution result, as the loop's parser reads it. */
export function automationStudioToolResultNeedsPerson(value: unknown): value is AutomationStudioLlmEvidenceToolExecutionResult & { personNeeded: true } {
  return executionResult(value) && value.personNeeded === true;
}

export function automationStudioPersonNeededToolCalls(input: {
  /** The executor underneath. */
  executeTool: ExecuteTool;
  /** The loop's tools; the one with an `initialObservation` is how the fresh look is taken. */
  tools: readonly AutomationStudioLlmEvidenceTool[];
  /** Where the question is raised from, for the thread's record. */
  stage: AutomationStudioAskStage;
  /** What the work calls itself when it stops, as in "The build stopped for a person". */
  subject: string;
  /** Where the question goes. Absent, a person-needed result ends the work at once: there is nobody to ask. */
  ask?: { port: AutomationStudioParkingPort; timeoutMs?: number | undefined; now?: (() => number) | undefined } | undefined;
  /** The work's own cancellation, so cancelled work stops waiting. */
  signal?: AbortSignal | undefined;
  /**
   * The code a call answers once a person has cleared the check it met, from
   * the call's own argument; absent, or answering nothing, it carries no code.
   */
  clearedResultCode?: ((value: JsonObject) => string | undefined) | undefined;
  maxAsks?: number | undefined;
  /**
   * Names each new question. Required, and supplied by the caller, because this
   * directory's barrel reaches the browser bundle (`ask-effect.ts`), which cannot
   * load `node:crypto`.
   */
  newAskId: () => string;
  /** Told of each question just before it is put, so the caller can show it. */
  onAsk?: ((ask: AutomationStudioAsk) => void) | undefined;
  /** Told when the person said Continue and the work goes on. */
  onCleared?: ((call: ToolCall) => void) | undefined;
}): AutomationStudioPersonNeededToolCalls {
  const stopped = new AbortController();
  const maxAsks = input.maxAsks ?? AUTOMATION_STUDIO_PERSON_NEEDED_MAX_ASKS;
  const newAskId = input.newAskId;
  const look = input.tools.find((tool) => tool.initialObservation);
  let asks = 0;
  // Questions since a call last came back without a check: what the bound counts (header).
  let inARow = 0;
  let ended: AutomationStudioPersonNeededEnding | undefined;

  const end = (reason: AutomationStudioPersonNeededEnding): never => {
    ended ??= reason;
    stopped.abort();
    // Thrown, not returned: whatever this call answered is about a check, and
    // the loop records a thrown call without showing a model any of it.
    throw new Error(`The ${input.subject} stopped for a person (${AUTOMATION_STUDIO_PERSON_NEEDED_ISSUE_CODES[ended]}).`);
  };

  /** Puts the question once, and returns only when the person got past the check. */
  const asked = async (call: ToolCall): Promise<void> => {
    if (inARow >= maxAsks) end("asks_exhausted");
    asks += 1;
    inARow += 1;
    const port = input.ask?.port;
    if (!port) return end("unreachable");
    const ask = automationStudioPersonNeededAsk(
      { ...automationStudioPersonNeededAskDraft({ timeoutMs: input.ask?.timeoutMs }), askId: newAskId() },
      { stage: input.stage }
    );
    input.onAsk?.(ask);
    const now = input.ask?.now;
    const outcome = await automationStudioAskedPersonNeeded({ port, ...(input.signal ? { signal: input.signal } : {}), ...(now ? { now } : {}) }, ask);
    if (outcome !== "done") end(outcome);
    input.onCleared?.(call);
  };

  /** A fresh look at the target, or why there is none: no look to take, or one that threw. */
  const freshLook = async (call: ToolCall): Promise<FreshLook> => {
    if (!look) return { seen: false, why: "no_look" };
    for (;;) {
      let ran: JsonValue | AutomationStudioLlmEvidenceToolExecutionResult;
      try {
        ran = await input.executeTool({ callId: automationStudioPersonNeededLookCallId(call.callId), toolId: look.toolId, value: structuredClone(look.initialObservation!.input), ...(call.signal ? { signal: call.signal } : {}) });
      } catch (error) {
        // The work stopping is not a look that failed.
        if (stopped.signal.aborted) throw error;
        // The step stands either way: the model is told the look did not come
        // back, and can take its own next turn.
        return { seen: false, why: "look_threw" };
      }
      // The person said Continue and the check is still there, or another one
      // came up: asked again, within the same bound.
      if (automationStudioToolResultNeedsPerson(ran)) {
        await asked(call);
        continue;
      }
      // The look met no check: the person got past this one.
      inARow = 0;
      if (!executionResult(ran)) return { seen: true, evidence: ran };
      const stateAfter = ran.stateDigests?.after ?? ran.stateDigests?.before;
      return { seen: true, evidence: ran.evidence, ...(stateAfter ? { stateAfter } : {}) };
    }
  };

  return {
    executeTool: async (call) => {
      const ran = await input.executeTool(call);
      if (!automationStudioToolResultNeedsPerson(ran)) {
        inARow = 0;
        return ran;
      }
      if (ended) end(ended);
      await asked(call);
      const now = await freshLook(call);
      return standing(ran, now, input.clearedResultCode?.(call.value));
    },
    signal: stopped.signal,
    ended: () => ended,
    asks: () => asks
  };
}

/** What the look after the person came back with. */
type FreshLook = { seen: true; evidence: JsonValue; stateAfter?: string } | { seen: false; why: "no_look" | "look_threw" };

/**
 * The call as it stands once the person has cleared the check.
 *
 * The caller's own statement about the step is kept -- what it ran, whether it
 * changed anything, which node it was -- because the caller wrote it describing
 * the step once cleared. Its code and reason are not: they describe the check,
 * which is behind the person now. `clearedCode` stands in for the code where
 * the call is read in a vocabulary of its own -- a replayed step, which the dry
 * run reads as `replayed`.
 */
function standing(
  ran: AutomationStudioLlmEvidenceToolExecutionResult,
  now: FreshLook,
  clearedCode: string | undefined
): AutomationStudioLlmEvidenceToolExecutionResult {
  const before = ran.stateDigests?.before;
  const after = now.seen ? now.stateAfter : undefined;
  const evidence: JsonObject = !now.seen
    ? { personCompletedCheck: true, note: PERSON_COMPLETED_NOTE_NO_LOOK, lookUnavailable: now.why }
    : isObject(now.evidence)
      ? { personCompletedCheck: true, note: PERSON_COMPLETED_NOTE, ...withoutOwnKeys(now.evidence) }
      : { personCompletedCheck: true, note: PERSON_COMPLETED_NOTE_NOW, now: now.evidence };
  return {
    kind: "llm_evidence_tool_execution",
    evidence,
    effectApplied: ran.effectApplied || ran.draft?.effect === "mutate",
    ...(ran.targetsUnchanged === undefined ? {} : { targetsUnchanged: ran.targetsUnchanged }),
    ...(clearedCode ? { resultCode: clearedCode } : {}),
    ...(ran.nodeId === undefined ? {} : { nodeId: ran.nodeId }),
    ...(before !== undefined || after !== undefined ? { stateDigests: { ...(before === undefined ? {} : { before }), ...(after === undefined ? {} : { after }) } } : {}),
    ...(ran.draft === undefined ? {} : { draft: ran.draft })
  };
}

/** The look's answer without the two keys the note owns. */
function withoutOwnKeys(look: JsonObject): JsonObject {
  const { personCompletedCheck: _flag, note: _note, ...rest } = look;
  return rest;
}

function isObject(value: JsonValue): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function executionResult(value: unknown): value is AutomationStudioLlmEvidenceToolExecutionResult {
  return typeof value === "object" && value !== null && !Array.isArray(value) && (value as { kind?: unknown }).kind === "llm_evidence_tool_execution";
}
