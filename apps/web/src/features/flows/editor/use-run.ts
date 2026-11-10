"use client";

import { useCallback, useState } from "react";
import type { ProgramCommandTransport } from "../../automation-studio/data/program-transport";
import { asRecord, runResult, textOf } from "../../home/model";
import { freshId, runPayload } from "../requests";

/** Where the Run button is: nothing yet, asking for inputs, a run going, or how it ended. */
export type RunState =
  | { state: "idle" }
  | { state: "asking" }
  | { state: "running"; runId: string }
  | { state: "ended"; runId: string; label: string; tone: string }
  | { state: "lost"; runId: string }
  | { state: "refused"; reason: string; runId?: string };

/**
 * A whole run of the Flow from its start. The run is named before it begins, so the page links
 * to it in Runs while it goes. The request waits for the run's end; when the page stops waiting
 * first, it says the run may still be going rather than calling it failed.
 */
export function useRun(studio: ProgramCommandTransport, flow: { projectId: string; flowId: string }, onEnded: () => void) {
  const [run, setRun] = useState<RunState>({ state: "idle" });
  const ask = useCallback(() => setRun({ state: "asking" }), []);
  const cancel = useCallback(() => setRun({ state: "idle" }), []);
  const start = useCallback(async (inputs: Record<string, unknown>) => {
    const runId = freshId();
    setRun({ state: "running", runId });
    const response = await studio.post("run-runtime-session", runPayload(flow, inputs, runId));
    const session = asRecord(asRecord(response.payload)?.runtimeSession);
    const status = textOf(session?.status);
    if (response.ok && status) {
      const result = runResult(status);
      setRun({ state: "ended", runId, label: result.label, tone: result.tone });
    } else if (response.status === 0) {
      setRun({ state: "lost", runId });
    } else {
      setRun({ state: "refused", reason: response.error ?? "The Flow could not be run.", ...(status ? { runId } : {}) });
    }
    onEnded();
  }, [studio, flow, onEnded]);
  return { run, ask, cancel, start };
}
