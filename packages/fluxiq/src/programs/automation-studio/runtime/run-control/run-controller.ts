// One live run's pause, takeover and resume.
//
// A run is only ever held *between* two steps. Asking to pause while a step is
// in flight records the request; the step finishes, and the run holds at the
// executor's next checkpoint, before the next node executes. So a click is
// never cut in half, and a held run has dispatched nothing it has not also
// finished.
//
// Holding touches nothing the run owns. The run's promise is still pending, so
// its abort controller, its admission, the LLM grant held for it and the
// grant's lease all stay exactly as they were: pausing neither releases them
// nor extends them. Resuming goes on from the very node the run held before,
// with its values, variables, loop positions and step budget untouched, so the
// same run under the same inputs takes the same path whether or not it was
// paused -- only the page may differ, if a person acted on it, and the next
// node reads the page as it finds it.
//
// A held run is bounded. Past `maxPausedMs` it stops itself, cancelled, rather
// than holding a browser, an admission and a grant for as long as nobody
// comes back.

import type {
  AutomationStudioRunCheckpoint,
  AutomationStudioRunCheckpointOutcome,
  AutomationStudioRunControlEvent,
  AutomationStudioRunControlGate,
  AutomationStudioRunControlHolder,
  AutomationStudioRunControlPhase,
  AutomationStudioRunControlSnapshot,
  AutomationStudioRunControlState
} from "./types.ts";

/**
 * How long a run may stay held before it stops itself. It matches how long the
 * web panel reads a run back after its request was cut short, so a run held
 * past it would be one no open panel was still watching.
 */
export const AUTOMATION_STUDIO_RUN_CONTROL_MAX_PAUSED_MS = 15 * 60_000;

/** The most control events one run keeps; a run toggled without end keeps its latest. */
const MAX_HISTORY = 50;

/** How much of a person's reason or note is kept. */
const MAX_TEXT = 500;

export type AutomationStudioRunControllerInput = {
  projectId: string;
  runId: string;
  /** The run's own abort signal: stopping a held run lets it go as stopped. */
  signal?: AbortSignal;
  now?: () => number;
  maxPausedMs?: number;
};

export class AutomationStudioRunController implements AutomationStudioRunControlGate {
  private readonly projectId: string;
  private readonly runId: string;
  private readonly signal: AbortSignal | undefined;
  private readonly now: () => number;
  private readonly maxPausedMs: number;
  private state: AutomationStudioRunControlState = "running";
  private holder: AutomationStudioRunControlHolder | null = null;
  private phase: AutomationStudioRunControlPhase = "executing";
  private reason: string | undefined;
  private requestedAt: number | undefined;
  private pausedAt: number | undefined;
  private heldAt: AutomationStudioRunCheckpoint | undefined;
  private lastNodeId: string | undefined;
  private release: ((outcome: AutomationStudioRunCheckpointOutcome) => void) | undefined;
  private expiry: ReturnType<typeof setTimeout> | undefined;
  private readonly history: AutomationStudioRunControlEvent[] = [];
  private readonly onAbort = () => this.stopHeld();

  constructor(input: AutomationStudioRunControllerInput) {
    this.projectId = input.projectId;
    this.runId = input.runId;
    this.signal = input.signal;
    this.now = input.now ?? Date.now;
    this.maxPausedMs = Math.max(1, input.maxPausedMs ?? AUTOMATION_STUDIO_RUN_CONTROL_MAX_PAUSED_MS);
    this.signal?.addEventListener("abort", this.onAbort, { once: true });
  }

  /**
   * Asks the run to hold. A takeover (`person`) on a run already held for
   * FluxIQ hands the page to the person; a plain pause never takes it back.
   */
  pause(input: { holder?: AutomationStudioRunControlHolder; reason?: string } = {}): AutomationStudioRunControlSnapshot {
    const holder = input.holder ?? "fluxiq";
    const reason = clipped(input.reason);
    if (this.signal?.aborted) return this.snapshot();
    if (this.state === "running") {
      this.state = "pause_requested";
      this.holder = holder;
      this.reason = reason;
      this.requestedAt = this.now();
      this.record({ kind: "pause_requested", at: this.requestedAt, holder, ...(reason ? { reason } : {}) });
    } else if (holder === "person" && this.holder !== "person") {
      this.holder = "person";
      if (reason) this.reason = reason;
      this.record({ kind: "pause_requested", at: this.now(), holder, ...(reason ? { reason } : {}) });
    }
    return this.snapshot();
  }

  /**
   * Lets the run go on. `afterManualAction` records that a person acted on the
   * page while it was held; the run resumes at the same node either way, and
   * that node reads the page as it now is. A pause still only requested is
   * simply withdrawn.
   */
  resume(input: { afterManualAction?: boolean; note?: string } = {}): AutomationStudioRunControlSnapshot {
    if (this.state === "running") return this.snapshot();
    const note = clipped(input.note);
    const afterManualAction = input.afterManualAction === true;
    const nodeId = this.heldAt?.nodeId;
    this.record({ kind: "resumed", at: this.now(), ...(nodeId ? { nodeId } : {}), afterManualAction, ...(note ? { note } : {}) });
    this.letGo({ outcome: "resume", afterManualAction });
    return this.snapshot();
  }

  /** Recovery is working on a failed step: the progress a person sees says so. */
  setPhase(phase: AutomationStudioRunControlPhase): void {
    this.phase = phase;
  }

  checkpoint(at: AutomationStudioRunCheckpoint): Promise<AutomationStudioRunCheckpointOutcome> | null {
    this.lastNodeId = at.nodeId;
    // Taking a step is executing, whatever recovery was doing before it.
    this.phase = "executing";
    if (this.state !== "pause_requested" || this.signal?.aborted) return null;
    this.state = "paused";
    this.heldAt = { nodeId: at.nodeId, step: at.step };
    this.pausedAt = this.now();
    this.record({ kind: "paused", at: this.pausedAt, holder: this.holder ?? "fluxiq", nodeId: at.nodeId, step: at.step });
    this.expiry = setTimeout(() => this.expire(), this.maxPausedMs);
    (this.expiry as { unref?: () => void }).unref?.();
    return new Promise((resolve) => { this.release = resolve; });
  }

  snapshot(): AutomationStudioRunControlSnapshot {
    return {
      projectId: this.projectId,
      runId: this.runId,
      state: this.state,
      holder: this.state === "running" ? null : this.holder,
      phase: this.phase,
      ...(this.state === "paused" && this.heldAt ? { nodeId: this.heldAt.nodeId, step: this.heldAt.step } : {}),
      ...(this.state !== "running" && this.requestedAt !== undefined ? { requestedAt: this.requestedAt } : {}),
      ...(this.state === "paused" && this.pausedAt !== undefined ? { pausedAt: this.pausedAt, expiresAt: this.pausedAt + this.maxPausedMs } : {}),
      ...(this.state !== "running" && this.reason ? { reason: this.reason } : {}),
      ...(this.lastNodeId ? { lastNodeId: this.lastNodeId } : {}),
      history: [...this.history]
    };
  }

  /** The run has ended: a run still held is let go as stopped, and nothing is left listening. */
  dispose(): AutomationStudioRunControlSnapshot {
    this.stopHeld();
    this.signal?.removeEventListener("abort", this.onAbort);
    return this.snapshot();
  }

  private stopHeld(): void {
    if (this.state === "paused" && this.heldAt) {
      this.record({ kind: "stopped_while_paused", at: this.now(), nodeId: this.heldAt.nodeId });
      this.letGo({ outcome: "stop", message: "Run cancelled while it was paused." });
    } else if (this.state === "pause_requested") {
      this.letGo({ outcome: "stop", message: "Run cancelled." });
    }
  }

  private expire(): void {
    if (this.state !== "paused" || !this.heldAt || this.pausedAt === undefined) return;
    const pausedMs = this.now() - this.pausedAt;
    this.record({ kind: "expired", at: this.now(), nodeId: this.heldAt.nodeId, pausedMs });
    const minutes = Math.max(1, Math.round(this.maxPausedMs / 60_000));
    this.letGo({ outcome: "stop", message: `The run was stopped because it stayed paused for more than ${minutes} ${minutes === 1 ? "minute" : "minutes"}.` });
  }

  private letGo(outcome: AutomationStudioRunCheckpointOutcome): void {
    if (this.expiry !== undefined) clearTimeout(this.expiry);
    this.expiry = undefined;
    const release = this.release;
    this.release = undefined;
    this.state = "running";
    this.holder = null;
    this.reason = undefined;
    this.requestedAt = undefined;
    this.pausedAt = undefined;
    this.heldAt = undefined;
    release?.(outcome);
  }

  private record(event: AutomationStudioRunControlEvent): void {
    this.history.push(event);
    if (this.history.length > MAX_HISTORY) this.history.splice(0, this.history.length - MAX_HISTORY);
  }
}

function clipped(value: string | undefined): string | undefined {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed ? trimmed.slice(0, MAX_TEXT) : undefined;
}
