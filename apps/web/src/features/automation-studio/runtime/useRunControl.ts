"use client";

// A live run's pause, takeover and resume, as the run panel drives them.
//
// The run's own request is still open while it is held -- a held run has not
// returned -- so its control and progress are read here on their own, by run
// id, for as long as the run is live. What is shown is always Core's answer:
// Paused is never inferred from a button having been pressed.

import { useCallback, useEffect, useRef, useState } from "react";
import type { RuntimeRunControlAnswer } from "./run-commands";
import type { RuntimeExecutionCommands } from "./runtime-host";

/** How often a live run's control is read while the panel shows it. */
const RUN_CONTROL_READ_INTERVAL_MS = 1_500;

export type RunControlHandle = {
  /** Whether this host can hold runs at all. */
  available: boolean;
  answer: RuntimeRunControlAnswer | null;
  busy: boolean;
  error: string;
  canPause: boolean;
  pause(takeControl?: boolean): Promise<void>;
  resume(afterManualAction?: boolean): Promise<void>;
};

export function useRunControl(input: { projectId: string | null; runId: string | null; commands: Pick<RuntimeExecutionCommands, "pause" | "resume" | "readControl"> }): RunControlHandle {
  const { projectId, runId, commands } = input;
  const [answer, setAnswer] = useState<RuntimeRunControlAnswer | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Answers for a run the panel has moved on from are dropped.
  const currentRef = useRef<string | null>(null);
  const key = projectId && runId ? `${projectId}:${runId}` : null;
  currentRef.current = key;
  const available = Boolean(commands.pause && commands.resume && commands.readControl);

  const accept = useCallback((forKey: string, result: { ok: boolean; payload?: RuntimeRunControlAnswer; error?: string }) => {
    if (currentRef.current !== forKey) return;
    if (result.ok && result.payload) { setAnswer(result.payload); setError(""); }
    else setError(result.error ?? "The run's controls could not be reached.");
  }, []);

  useEffect(() => {
    setAnswer(null);
    setError("");
    if (!key || !projectId || !runId || !commands.readControl) return;
    const read = commands.readControl;
    let stopped = false;
    const tick = async () => {
      try {
        const result = await read({ projectId, runId });
        if (!stopped) accept(key, result);
      } catch {
        /* best-effort: the next read tries again, and the run's own answer still arrives */
      }
    };
    void tick();
    const timer = globalThis.setInterval(() => void tick(), RUN_CONTROL_READ_INTERVAL_MS);
    return () => { stopped = true; globalThis.clearInterval(timer); };
  }, [accept, commands.readControl, key, projectId, runId]);

  const send = useCallback(async (call: () => Promise<{ ok: boolean; payload?: RuntimeRunControlAnswer; error?: string }> | undefined) => {
    if (!key) return;
    setBusy(true);
    try {
      const result = await call();
      if (result) accept(key, result);
    } catch {
      if (currentRef.current === key) setError("The run's controls could not be reached.");
    } finally {
      setBusy(false);
    }
  }, [accept, key]);

  const pause = useCallback(async (takeControl = false) => {
    if (!projectId || !runId) return;
    await send(() => commands.pause?.({ projectId, runId, ...(takeControl ? { takeControl: true } : {}) }));
  }, [commands, projectId, runId, send]);

  const resume = useCallback(async (afterManualAction = false) => {
    if (!projectId || !runId) return;
    await send(() => commands.resume?.({ projectId, runId, ...(afterManualAction ? { afterManualAction: true } : {}) }));
  }, [commands, projectId, runId, send]);

  const canPause = Boolean(available && key && !busy && answer?.live && answer.runControl?.state === "running");
  return { available, answer, busy, error, canPause, pause, resume };
}
