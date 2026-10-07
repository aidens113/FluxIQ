import type { ClientGatewayCommandContext, ClientGatewayCommandLedgerLease } from "../../../../../client-gateway/service/command-ledger/index.ts";
import { AutomationStudioCommandRunController, type AutomationStudioCommandRunScope, type AutomationStudioCommandRunOwner, type AutomationStudioCommandEffectProvenance } from "../command-run/index.ts";
import { AutomationStudioNodeAttemptExecution } from "../../executor/node-execution/index.ts";
import type { AutomationStudioExecutorCommandRun } from "../../executor/command-scope/index.ts";
import { AutomationStudioCanonicalExecution } from "../../composite-execution/index.ts";
import type { AutomationStudioCommandExecutionPorts } from "./contracts.ts";

type State = { port: AutomationStudioExecutorCommandRun; scope?: AutomationStudioCommandRunScope; abort: AbortController; blocked?: string; pipelines: Set<Promise<unknown>>; detach(): void; closing?: Promise<void> };
type Effect = { state: State; consumer: object; provenance: AutomationStudioCommandEffectProvenance };
/** Actual executor-entry/handling provenance joins the sole durable ticket controller. */
export class AutomationStudioCommandExecutionController {
  private readonly commandRuns: AutomationStudioCommandRunController;
  private readonly disposeRuns: (scope?: AutomationStudioCommandRunScope) => Promise<void>;
  private readonly states = new Set<State>();
  private readonly ports = new WeakMap<AutomationStudioExecutorCommandRun, State>();
  private readonly effects = new WeakMap<object, Effect>();
  private readonly contexts = new WeakMap<ClientGatewayCommandContext, { state: State; capability: object }>();
  private readonly openings = new Set<Promise<unknown>>();
  private readonly cleanupErrors: unknown[] = [];
  private closed = false;
  private closing?: Promise<void>;
  constructor(ports: AutomationStudioCommandExecutionPorts) {
    this.commandRuns = new AutomationStudioCommandRunController({ ...ports, executorOwner: {
      inspectEffect: capability => this.effects.get(capability)?.provenance ?? null,
      authorizeHandling: (consumer, capability, context) => {
        const effect = this.effects.get(capability);
        return effect && effect.consumer === consumer && this.contexts.get(context)?.state === effect.state && this.contexts.get(context)?.capability === capability
          ? AutomationStudioNodeAttemptExecution.readHandling(consumer, capability, context, effect.state.port) : null;
      }
    } });
    this.disposeRuns = this.commandRuns.close.bind(this.commandRuns);
  }
  open(owner: AutomationStudioCommandRunOwner & { signal?: AbortSignal }): Promise<AutomationStudioExecutorCommandRun> {
    if (this.closed) throw new Error("command_execution.closed");
    const pending = this.openStored(owner); this.track(pending, this.openings); return pending;
  }
  owns(context: ClientGatewayCommandContext): boolean { return this.contexts.has(context); }
  async resolve(context: ClientGatewayCommandContext): Promise<ClientGatewayCommandLedgerLease> {
    const registered = this.contexts.get(context);
    if (!registered) throw new Error("command_execution.foreign_context");
    const { state } = registered; this.live(state);
    let release!: () => void;
    this.track(new Promise<void>(resolve => { release = resolve; }), state.pipelines);
    let lease: ClientGatewayCommandLedgerLease | undefined, closing: Promise<void> | undefined;
    const close = () => closing ??= (async () => {
      try { await lease?.close(); } catch (error) { this.cleanupErrors.push(error); throw error; } finally { release(); }
    })();
    try {
      lease = await this.commandRuns.resolve(context); this.live(state);
      return { ...lease, close };
    } catch (error) {
      this.stop(state, "command_execution.resolve_failed");
      try { await close(); } catch (cleanupError) { throw new AggregateError([error, cleanupError], "command_execution.resolve_and_cleanup_failed"); }
      throw error;
    }
  }
  closeRun(port: AutomationStudioExecutorCommandRun): Promise<void> {
    const state = this.ports.get(port); if (!state) throw new Error("command_execution.foreign_run"); return this.closeState(state);
  }
  close(): Promise<void> {
    this.closed = true;
    for (const state of this.states) this.stop(state, "command_execution.closed");
    this.closing ??= (async () => {
      await Promise.allSettled([...this.openings]);
      const results = await Promise.allSettled([...this.states].map(state => this.closeState(state)));
      try { await this.disposeRuns(); } catch (error) { results.push({ status: "rejected", reason: error }); }
      const errors = [...this.cleanupErrors, ...results.filter((r): r is PromiseRejectedResult => r.status === "rejected").map(r => r.reason)];
      if (errors.length) throw new AggregateError(errors, "command_execution.close_failed");
    })(); return this.closing;
  }
  private async openStored(owner: AutomationStudioCommandRunOwner & { signal?: AbortSignal }): Promise<AutomationStudioExecutorCommandRun> {
    const abort = new AbortController();
    let state!: State;
    const port: AutomationStudioExecutorCommandRun = Object.freeze({
      signal: abort.signal,
      acceptsComposite: (callback: object) => { this.live(state); return AutomationStudioCanonicalExecution.isRegistered(callback); },
      own: <T>(start: () => Promise<T>): Promise<T> => { this.live(state); const promise = start(); this.track(promise, state.pipelines); return promise; },
      checkpoint: async () => { this.live(state); try { await this.commandRuns.checkpoint(state.scope!); this.live(state); } catch (error) { this.stop(state, "command_execution.checkpoint_failed"); throw error; } },
      context: async (consumer: object, ordinal: number) => {
        this.live(state);
        const entry = AutomationStudioNodeAttemptExecution.readEntry(consumer, port);
        const capability = Object.freeze({});
        this.effects.set(capability, { state, consumer, provenance: Object.freeze({ scope: state.scope!, consumer, invocationId: entry.invocationId, attemptId: entry.attemptId, nodeId: entry.nodeId, executingFlowId: entry.executingFlowId, executingFlowDigest: entry.executingFlowDigest, effectOrdinal: ordinal }) });
        let context: ClientGatewayCommandContext;
        try { context = await this.commandRuns.issueEffect(state.scope!, capability); } catch (error) { this.stop(state, "command_execution.issue_failed"); throw error; }
        this.contexts.set(context, { state, capability }); this.live(state); return Object.freeze({ capability, context });
      },
      consume: async (consumer: object, capability: object, context: ClientGatewayCommandContext) => {
        this.live(state); const effect = this.effects.get(capability);
        if (!effect || effect.state !== state || effect.consumer !== consumer || this.contexts.get(context)?.state !== state || this.contexts.get(context)?.capability !== capability) throw new Error("command_execution.foreign_handling");
        try { await this.commandRuns.consume(consumer, context); this.live(state); } catch (error) { this.stop(state, "command_execution.consume_failed"); throw error; }
      },
      stop: async (reason: string) => { this.stop(state, reason); }
    });
    const parentAbort = () => this.stop(state, "command_execution.cancelled");
    state = { port, abort, pipelines: new Set(), detach: () => owner.signal?.removeEventListener("abort", parentAbort) };
    this.ports.set(port, state); this.states.add(state); owner.signal?.addEventListener("abort", parentAbort, { once: true });
    if (owner.signal?.aborted || this.closed) this.stop(state, "command_execution.cancelled");
    try {
      state.scope = await this.commandRuns.open({ projectId: owner.projectId, runId: owner.runId, rootFlowId: owner.rootFlowId, signal: abort.signal });
      this.live(state); return port;
    } catch (error) {
      this.stop(state, "command_execution.open_failed");
      try { await this.closeState(state); } catch (cleanupError) { throw new AggregateError([error, cleanupError], "command_execution.open_and_cleanup_failed"); }
      throw error;
    }
  }
  private live(state: State): void { if (this.closed || state.blocked || state.abort.signal.aborted) throw new Error(state.blocked ?? "command_execution.closed"); }
  private stop(state: State, reason: string): void { state.blocked ??= reason; if (!state.abort.signal.aborted) state.abort.abort(new Error(state.blocked)); }
  private track(promise: Promise<unknown>, pipelines: Set<Promise<unknown>>): void { pipelines.add(promise); void promise.then(() => pipelines.delete(promise), () => { /* best-effort: retire tracking only; the original caller still receives its rejection. */ pipelines.delete(promise); }); }
  private closeState(state: State): Promise<void> {
    this.stop(state, "command_execution.closed"); state.detach();
    state.closing ??= (async () => { while (state.pipelines.size) await Promise.allSettled([...state.pipelines]);
      try { if (state.scope) await this.disposeRuns(state.scope); } catch (error) { this.cleanupErrors.push(error); throw error; } finally { this.states.delete(state); } })(); return state.closing;
  }
}
