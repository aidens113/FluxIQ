// One run from request to its last event: start it, follow its events, answer the
// ones that wait for this process, and stop it when the program's signal aborts.

import {
  FLUXNODE_API_PATHS,
  fluxNodeAnswerEventResponseSchema,
  fluxNodeApiPath,
  fluxNodeStartRunResponseSchema,
  fluxNodeStopRunResponseSchema,
  parseFluxNodeRunRequest,
  type FluxNodeRunEvent,
  type FluxNodeRunRequestInput
} from "@fluxiq/contracts/fluxnode";
import type { AnyFluxNode } from "../define/index.ts";
import { FluxNodeApiError, SdkError } from "../errors/index.ts";
import { answerFor } from "./answer-event.ts";
import { followRun } from "./follow-run.ts";
import type { RunOptions } from "./run-types.ts";
import type { Transport } from "./transport.ts";

const BENIGN_ANSWER_ERRORS = new Set(["event_already_answered", "run_ended"]);

/** Starts the run `request` describes and yields its events until `ended`. `node` supplies the check. */
export async function* executeRun(transport: Transport, request: FluxNodeRunRequestInput, node: AnyFluxNode | undefined, options: RunOptions): AsyncGenerator<FluxNodeRunEvent> {
  if (options.signal?.aborted === true) throw new SdkError("aborted", "The AbortSignal was already aborted, so the run was not started.");
  const checked = parseFluxNodeRunRequest(request);
  if (!checked.ok) {
    const lines = checked.issues.map((issue) => `${issue.path === "" ? "(request)" : issue.path}: ${issue.message}`);
    throw new SdkError("invalid_inputs", `The run request is not valid:\n  ${lines.join("\n  ")}`, { issues: checked.issues });
  }
  const state = await transport.json({ method: "POST", path: FLUXNODE_API_PATHS.runs, body: checked.value, answer: fluxNodeStartRunResponseSchema });
  const stopWhenAborted = (): void => {
    transport
      .json({ method: "POST", path: fluxNodeApiPath("runStop", { runId: state.runId }), body: {}, answer: fluxNodeStopRunResponseSchema })
      .catch(() => {
        /* best-effort: the run may have ended already, and its ended event says how */
      });
  };
  options.signal?.addEventListener("abort", stopWhenAborted, { once: true });
  try {
    for await (const event of followRun(transport, state.eventsPath)) {
      options.onEvent?.(event);
      const answer = await answerFor(event, node, options);
      if (answer !== undefined) {
        try {
          await transport.json({ method: "POST", path: fluxNodeApiPath("runAnswers", { runId: state.runId }), body: answer, answer: fluxNodeAnswerEventResponseSchema });
        } catch (error) {
          if (!(error instanceof FluxNodeApiError && BENIGN_ANSWER_ERRORS.has(String(error.apiCode)))) throw error;
        }
      }
      yield event;
    }
  } finally {
    options.signal?.removeEventListener("abort", stopWhenAborted);
  }
}
