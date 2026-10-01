import type { AutomationStudioRuntimeSession } from "../../../model/index.ts";
import { isTerminalRuntimeSessionStatus } from "./terminal-status.ts";
import { settleAutomationStudioParkedRunWait } from "./parked-wait.ts";

type Ports = {
  read(projectId: string, runId: string): Promise<AutomationStudioRuntimeSession | null>;
  list(projectId: string): Promise<AutomationStudioRuntimeSession[]>;
  write(projectId: string, session: AutomationStudioRuntimeSession): Promise<void>;
};

type UnconfirmedSettlement = { before: AutomationStudioRuntimeSession; after: AutomationStudioRuntimeSession; resolution: "cancelled" | "timed_out" };

/** Deadlines for durable parked sessions; settlements share a run's persistence lock. */
export class AutomationStudioParkedRunExpiry {
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly pending = new Map<string, Promise<unknown>>();
  private readonly removing = new Set<string>();
  private readonly unconfirmed = new Map<string, UnconfirmedSettlement>();
  private closed = false;

  constructor(private readonly ports: Ports) {}

  async withRun<T>(projectId: string, runId: string, operation: () => Promise<T>): Promise<T> {
    const key = JSON.stringify([projectId, runId]);
    const previous = this.pending.get(key);
    const running = (async () => {
      if (previous) await previous.catch(() => undefined); // Awaiting another caller's failure drops no report.
      if (this.removing.has(projectId)) throw new Error("The project is being removed.");
      return await operation();
    })();
    this.pending.set(key, running);
    try { return await running; }
    finally { if (this.pending.get(key) === running) this.pending.delete(key); }
  }

  track(projectId: string, session: AutomationStudioRuntimeSession): void {
    const key = JSON.stringify([projectId, session.runId]);
    const old = this.timers.get(key);
    if (old) clearTimeout(old);
    this.timers.delete(key);
    const pending = this.unconfirmed.get(key);
    if (pending && !this.sameSession(session, pending.before) && !this.sameSession(session, pending.after)) this.unconfirmed.delete(key);
    if (this.unconfirmed.has(key)) {
      if (!this.closed && !this.removing.has(projectId)) this.arm(projectId, session.runId, 1_000);
      return;
    }
    const deadline = session.trace?.parked?.expiresAtMs;
    if (this.closed || this.removing.has(projectId) || session.status !== "waiting" || deadline === undefined || !Number.isFinite(deadline)) return;
    this.arm(projectId, session.runId, Math.max(0, deadline - Date.now()));
  }

  async expire(projectId: string, runId: string): Promise<AutomationStudioRuntimeSession | null> {
    return await this.withRun(projectId, runId, async () => {
      const stored = await this.ports.read(projectId, runId);
      const session = await this.retrySettlement(projectId, runId, stored);
      const parked = session?.trace?.parked;
      const now = Date.now();
      if (!session || session.status !== "waiting" || !parked || parked.expiresAtMs === undefined || parked.expiresAtMs > now || !Number.isFinite(parked.expiresAtMs)) {
        if (session) this.track(projectId, session);
        return session;
      }
      const expired: AutomationStudioRuntimeSession = {
        ...session, status: "failed", finishedAt: now,
        trace: {
          ...session.trace!, status: "failed", finishedAt: now, message: "Nobody answered before the parked wait expired.",
          parked: { ...parked, ask: { ...parked.ask, status: "expired" } },
          attempts: session.trace!.attempts.map((attempt) => attempt.ask?.askId === parked.ask.askId
            ? { ...attempt, ask: { ...attempt.ask, status: "expired", route: parked.routes.timedOut, settledAtMs: now } } : attempt)
        }
      };
      await this.persistSettlement(projectId, { before: session, after: expired, resolution: "timed_out" });
      return expired;
    });
  }

  /** Cancellation shares the deadline lock, so a parked ask is settled at most once. */
  async cancel(projectId: string, runId: string, reason: string, abort: () => void): Promise<AutomationStudioRuntimeSession | null> {
    return await this.withRun(projectId, runId, async () => {
      const stored = await this.ports.read(projectId, runId);
      const session = await this.retrySettlement(projectId, runId, stored);
      if (!session || isTerminalRuntimeSessionStatus(session.status)) return session;
      abort();
      const now = Date.now();
      const cancelled = this.cancelledSession(session, reason, now);
      await this.persistSettlement(projectId, { before: session, after: cancelled, resolution: "cancelled" });
      return cancelled;
    });
  }

  /** Stop expiry while deletion settles waits and removes their persisted records. */
  async withProjectRemoval<T>(projectId: string, operation: () => Promise<T>): Promise<T> {
    if (this.removing.has(projectId)) throw new Error("The project is already being removed.");
    this.removing.add(projectId);
    for (const [key, timer] of this.timers) if ((JSON.parse(key) as string[])[0] === projectId) {
      clearTimeout(timer); this.timers.delete(key);
    }
    try {
      await Promise.all([...this.pending].filter(([key]) => (JSON.parse(key) as string[])[0] === projectId).map(([, promise]) => promise.then(() => undefined, () => undefined)));
      for (const stored of await this.ports.list(projectId)) {
        const session = await this.retrySettlement(projectId, stored.runId, stored);
        if (!session || session.status !== "waiting" || !session.trace?.parked) continue;
        await this.persistSettlement(projectId, { before: session, after: this.cancelledSession(session, "Project deleted.", Date.now()), resolution: "cancelled" });
      }
      return await operation();
    } catch (error) {
      this.removing.delete(projectId);
      try { for (const session of await this.ports.list(projectId)) this.track(projectId, session); }
      catch { console.error("Parked deadlines could not be restored after project removal failed."); }
      throw error;
    } finally { this.removing.delete(projectId); }
  }

  async close(): Promise<void> {
    this.closed = true;
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    await Promise.allSettled([...this.pending.values()]);
  }

  private async persistSettlement(projectId: string, pending: UnconfirmedSettlement): Promise<void> {
    const key = JSON.stringify([projectId, pending.before.runId]);
    if (pending.before.status !== "waiting" || !pending.before.trace?.parked) {
      await this.ports.write(projectId, pending.after);
      this.track(projectId, pending.after);
      return;
    }
    this.unconfirmed.set(key, pending);
    try { await this.ports.write(projectId, pending.after); }
    catch (error) { this.track(projectId, pending.after); throw error; }
    this.unconfirmed.delete(key);
    this.track(projectId, pending.after);
    settleAutomationStudioParkedRunWait(projectId, pending.before, pending.resolution);
  }

  private async retrySettlement(projectId: string, runId: string, current: AutomationStudioRuntimeSession | null): Promise<AutomationStudioRuntimeSession | null> {
    const key = JSON.stringify([projectId, runId]);
    const pending = this.unconfirmed.get(key);
    if (!pending) return current;
    // A write can store its session before a later index/detail stage fails. Retry
    // only the original snapshot or that exact partial result, never newer work.
    if (!current || (!this.sameSession(current, pending.before) && !this.sameSession(current, pending.after))) {
      this.unconfirmed.delete(key);
      return current;
    }
    await this.persistSettlement(projectId, pending);
    return pending.after;
  }

  private sameSession(left: AutomationStudioRuntimeSession, right: AutomationStudioRuntimeSession): boolean {
    // JSON storage may reorder keys; equality ignores only ordering and omitted values.
    const canonical = (session: AutomationStudioRuntimeSession) => JSON.stringify(session, (_key, value: unknown) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return value;
      return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
    });
    return canonical(left) === canonical(right);
  }

  private cancelledSession(session: AutomationStudioRuntimeSession, reason: string, now: number): AutomationStudioRuntimeSession {
    return {
      ...session, status: "cancelled", finishedAt: session.finishedAt ?? now,
      metadata: { ...(session.metadata ?? {}), cancellation: { at: now, reason } },
      trace: session.trace ?? { status: "cancelled", startedAt: session.startedAt ?? session.queuedAt, finishedAt: now, attempts: [], values: {}, effects: [], message: reason }
    };
  }

  private arm(projectId: string, runId: string, delayMs: number): void {
    const key = JSON.stringify([projectId, runId]);
    const previous = this.timers.get(key);
    if (previous) clearTimeout(previous);
    const timer = setTimeout(() => {
      this.timers.delete(key);
      void this.expire(projectId, runId).catch(() => {
        /* best-effort: keep the unresolved deadline and retry while screening persistence errors */
        // Report failure without exposing persisted page data, then retry the still-open deadline.
        console.error("A parked run settlement could not be persisted; its wait remains open.");
        if (!this.closed && !this.removing.has(projectId)) this.arm(projectId, runId, 1_000);
      });
    }, Math.min(delayMs, 2_147_483_647));
    timer.unref?.();
    this.timers.set(key, timer);
  }
}
