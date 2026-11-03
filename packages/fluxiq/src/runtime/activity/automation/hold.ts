import { emitAutomationStudioActivity } from "./emit.ts";
import { automationStudioActivityHumanLabel } from "./wording/index.ts";

/** Where a run holds: the node it executes first when it is let go, and that node's place in the Flow. */
type HeldAt = {
  nodeId: string;
  label?: string | undefined;
  /** The step's number in the Flow (`./step/numbers.ts`); undefined for a Merge, which has none. */
  index: number | undefined;
  count: number;
  /** A takeover: the person has the page, not a plain pause. */
  byPerson: boolean;
  /** The run's own signal: a run let go because it was stopped does not say it continues. */
  signal?: AbortSignal | undefined;
};

/**
 * Says a run is held at a step boundary, waits until it is let go, and says
 * it continues: one `paused` event when the hold starts and one `running`
 * event when it is released to go on, never one per poll of the hold. A hold
 * released as stopped says nothing here; the run ends through its ordinary
 * cancelled ending (`./run.ts`), which carries `stopped`.
 *
 * Without this the overlay kept "Running step N" for the whole of a takeover
 * and the chat showed nothing (`ux-mvp-design.md`, Unit 3).
 */
export async function automationStudioActivityHold<T extends { outcome: string }>(held: Promise<T>, at: HeldAt): Promise<T> {
  const label = automationStudioActivityHumanLabel(at.label, 160);
  const step = at.index === undefined ? undefined : { index: at.index, count: at.count, nodeId: at.nodeId, ...(label ? { label } : {}) };
  emitAutomationStudioActivity({ phase: "paused", label: at.byPerson ? "Paused: you have the page" : "Paused", ...(step ? { step } : {}) });
  const released = await held;
  if (released.outcome === "resume" && !at.signal?.aborted) {
    emitAutomationStudioActivity({ phase: "running", label: step ? `Continuing from step ${step.index}` : "Continuing the run", ...(step ? { step } : {}) });
  }
  return released;
}
