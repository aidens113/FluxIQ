import { randomUUID } from "node:crypto";
import type {
  FluxIQRuntimeAdapter,
  FluxIQRuntimeCapability,
  FluxIQRuntimeClient,
  FluxIQRuntimeCommand,
  FluxIQRuntimeCommandAttempt,
  FluxIQRuntimeCommandResult,
  FluxIQRuntimeDispatchContext,
  FluxIQRuntimeEvent,
  FluxIQRuntimeEventHandler,
  FluxIQRuntimeRun,
  FluxIQRuntimeSnapshot,
  FluxIQRuntimeTransport
} from "./contracts.ts";
import type { RuntimeStore } from "./storage.ts";

export type RuntimeServiceOptions = {
  runtimeId?: string;
  now?: () => number;
  store?: RuntimeStore;
};

export class RuntimeService {
  private readonly runtimeId: string;
  private readonly now: () => number;
  private readonly store: RuntimeStore | undefined;
  private readonly readyPromise: Promise<void>;
  private pendingWrites: Promise<void> = Promise.resolve();
  private readonly adapters = new Map<string, FluxIQRuntimeAdapter>();
  private readonly transports = new Map<string, FluxIQRuntimeTransport>();
  private readonly handlers = new Set<FluxIQRuntimeEventHandler>();
  private readonly runs = new Map<string, FluxIQRuntimeRun>();
  private readonly commandAttempts = new Map<string, FluxIQRuntimeCommandAttempt>();
  private readonly transportUnsubscribes = new Map<string, () => void>();

  constructor(options: RuntimeServiceOptions = {}) {
    this.runtimeId = options.runtimeId ?? `runtime.${randomUUID()}`;
    this.now = options.now ?? Date.now;
    this.store = options.store;
    this.readyPromise = this.loadStoredState();
  }

  id(): string {
    return this.runtimeId;
  }

  async ready(): Promise<void> {
    await this.readyPromise;
    await this.pendingWrites;
  }

  registerAdapter(adapter: FluxIQRuntimeAdapter): this {
    const adapterId = normalizeId(adapter.adapterId);
    if (!adapterId) throw new Error("Runtime adapter id is required.");
    if (this.adapters.has(adapterId)) throw new Error(`Duplicate runtime adapter: ${adapter.adapterId}`);
    this.adapters.set(adapterId, adapter);
    return this;
  }

  registerTransport(transport: FluxIQRuntimeTransport): this {
    const transportId = normalizeId(transport.transportId);
    if (!transportId) throw new Error("Runtime transport id is required.");
    if (this.transports.has(transportId)) throw new Error(`Duplicate runtime transport: ${transport.transportId}`);
    this.transports.set(transportId, transport);
    this.transportUnsubscribes.set(transportId, transport.onEvent((event) => this.emit(event)));
    return this;
  }

  unregisterTransport(transportId: string): boolean {
    const normalized = normalizeId(transportId);
    const unsubscribe = this.transportUnsubscribes.get(normalized);
    unsubscribe?.();
    this.transportUnsubscribes.delete(normalized);
    return this.transports.delete(normalized);
  }

  adaptersList(): FluxIQRuntimeAdapter[] {
    return [...this.adapters.values()];
  }

  transportsList(): FluxIQRuntimeTransport[] {
    return [...this.transports.values()];
  }

  clients(): FluxIQRuntimeClient[] {
    const directClients = [...this.adapters.values()].map((adapter) => {
      const client: FluxIQRuntimeClient = {
        clientId: `adapter:${adapter.adapterId}`,
        label: adapter.label,
        transport: adapter.transport,
        status: "ready",
        capabilities: []
      };
      if (adapter.domainId !== undefined) client.domainId = adapter.domainId;
      return client;
    });
    return [
      ...directClients,
      ...[...this.transports.values()].flatMap((transport) => transport.clients())
    ];
  }

  async capabilities(): Promise<FluxIQRuntimeCapability[]> {
    const adapterCapabilities = await Promise.all([...this.adapters.values()].map(async (adapter) => await adapter.capabilities()));
    return [
      ...adapterCapabilities.flat(),
      ...[...this.transports.values()].flatMap((transport) => transport.clients().flatMap((client) => client.capabilities))
    ];
  }

  async snapshot(): Promise<FluxIQRuntimeSnapshot> {
    await this.readyPromise;
    const adapters = await Promise.all([...this.adapters.values()].map(async (adapter) => {
      const summary: FluxIQRuntimeSnapshot["adapters"][number] = {
        adapterId: adapter.adapterId,
        label: adapter.label,
        transport: adapter.transport,
        capabilities: await adapter.capabilities()
      };
      if (adapter.domainId !== undefined) summary.domainId = adapter.domainId;
      return summary;
    }));
    const transports = [...this.transports.values()].map((transport) => ({
      transportId: transport.transportId,
      label: transport.label,
      kind: transport.kind,
      clients: transport.clients()
    }));
    return {
      runtimeId: this.runtimeId,
      clients: this.clients(),
      adapters,
      transports,
      capabilities: await this.capabilities(),
      runs: [...this.runs.values()].map((run) => ({ ...run, commandIds: [...run.commandIds] })),
      commandAttempts: [...this.commandAttempts.values()].map(cloneCommandAttempt)
    };
  }

  createRun(input: {
    runId?: string;
    projectId?: string | null;
    domainId?: string | null;
    targetKind: FluxIQRuntimeRun["targetKind"];
    targetId: string;
    metadata?: FluxIQRuntimeRun["metadata"];
  }): FluxIQRuntimeRun {
    const run: FluxIQRuntimeRun = {
      schemaVersion: "0.1",
      runId: input.runId ?? `run.${randomUUID()}`,
      targetKind: input.targetKind,
      targetId: input.targetId,
      status: "queued",
      queuedAt: this.now(),
      commandIds: []
    };
    if (input.projectId !== undefined) run.projectId = input.projectId;
    if (input.domainId !== undefined) run.domainId = input.domainId;
    if (input.metadata !== undefined) run.metadata = input.metadata;
    this.runs.set(run.runId, run);
    this.persistRun(run);
    void this.emit({ type: "run.queued", run });
    return { ...run, commandIds: [...run.commandIds] };
  }

  getRun(runId: string): FluxIQRuntimeRun | undefined {
    const run = this.runs.get(runId);
    return run ? { ...run, commandIds: [...run.commandIds] } : undefined;
  }

  commandAttempt(attemptId: string): FluxIQRuntimeCommandAttempt | undefined {
    const attempt = this.commandAttempts.get(attemptId);
    return attempt ? cloneCommandAttempt(attempt) : undefined;
  }

  commandAttemptsList(): FluxIQRuntimeCommandAttempt[] {
    return [...this.commandAttempts.values()].map(cloneCommandAttempt);
  }

  async dispatch(command: FluxIQRuntimeCommand, context: FluxIQRuntimeDispatchContext = {}): Promise<FluxIQRuntimeCommandResult> {
    await this.readyPromise;
    const commandId = command.commandId ?? `command.${randomUUID()}`;
    const normalizedCommand = { ...command, commandId };
    const run = context.runId ? this.runs.get(context.runId) : undefined;
    if (run) {
      run.status = "running";
      run.startedAt ??= this.now();
      if (!run.commandIds.includes(commandId)) run.commandIds.push(commandId);
      this.persistRun(run);
      await this.emit({ type: "run.started", run: { ...run, commandIds: [...run.commandIds] } });
    }
    const target = await this.selectTarget(normalizedCommand, context);
    const attempt: FluxIQRuntimeCommandAttempt = {
      attemptId: `attempt.${randomUUID()}`,
      commandId,
      command: normalizedCommand,
      status: "dispatched",
      dispatchedAt: this.now()
    };
    if (context.runId !== undefined) attempt.runId = context.runId;
    if (target?.kind === "adapter") {
      attempt.adapterId = target.adapter.adapterId;
      attempt.transport = target.adapter.transport;
    } else if (target?.kind === "transport") {
      attempt.transport = target.transport.kind;
      if (target.client) {
        attempt.clientId = target.client.clientId;
        if (target.client.sessionId !== undefined) attempt.sessionId = target.client.sessionId;
      }
    }
    this.commandAttempts.set(attempt.attemptId, attempt);
    this.persistCommandAttempt(attempt);
    await this.emit({ type: "command.dispatched", ...(context.runId ? { runId: context.runId } : {}), command: normalizedCommand });

    const result = target
      ? await this.dispatchToTarget(target, normalizedCommand, context)
      : rejectedResult(commandId, "No runtime adapter or transport client matches the requested command.", this.now());
    const settled = this.settleAttempt(attempt.attemptId, result);
    await this.emit({ type: "command.result", ...(context.runId ? { runId: context.runId } : {}), result });
    if (run) {
      if (settled?.clientId !== undefined) run.selectedClientId = settled.clientId;
      if (settled?.sessionId !== undefined) run.selectedSessionId = settled.sessionId;
      if (settled?.transport !== undefined) run.transport = settled.transport;
      run.finishedAt = this.now();
      run.status = runtimeRunStatusFromCommandStatus(result.status);
      this.persistRun(run);
      await this.emit({ type: "run.finished", run: { ...run, commandIds: [...run.commandIds] } });
    }
    return result;
  }

  onEvent(handler: FluxIQRuntimeEventHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  async emit(event: FluxIQRuntimeEvent): Promise<void> {
    await Promise.all([...this.handlers].map((handler) => handler(event)));
  }

  private async selectTarget(command: FluxIQRuntimeCommand & { commandId: string }, context: FluxIQRuntimeDispatchContext): Promise<RuntimeDispatchTarget | null> {
    for (const adapter of this.adapters.values()) {
      if (await adapterMatchesCommand(adapter, command)) return { kind: "adapter", adapter };
    }
    for (const transport of this.transports.values()) {
      const client = transport.clients().find((candidate) => runtimeClientMatchesCommand(candidate, command, context));
      if (client) return { kind: "transport", transport, client };
    }
    return null;
  }

  private async dispatchToTarget(target: RuntimeDispatchTarget, command: FluxIQRuntimeCommand & { commandId: string }, context: FluxIQRuntimeDispatchContext): Promise<FluxIQRuntimeCommandResult> {
    const run = async () => {
      if (target.kind === "transport") {
        return await target.transport.dispatch(command, {
          ...context,
          ...(target.client.sessionId !== undefined ? { preferredSessionId: target.client.sessionId } : {}),
          preferredClientId: target.client.clientId
        });
      }
      if (command.kind === "capture_snapshot" && target.adapter.captureSnapshot) return await target.adapter.captureSnapshot(command, context);
      if (command.kind === "read_state" && target.adapter.readState) return await target.adapter.readState(command, context);
      return await target.adapter.execute(command, context);
    };
    return await withRuntimeBounds(run, command, context, this.now);
  }

  private settleAttempt(attemptId: string, result: FluxIQRuntimeCommandResult): FluxIQRuntimeCommandAttempt | undefined {
    const attempt = this.commandAttempts.get(attemptId);
    if (!attempt) return undefined;
    attempt.status = result.status;
    attempt.settledAt = this.now();
    attempt.result = result;
    if (result.message !== undefined) attempt.message = result.message;
    this.persistCommandAttempt(attempt);
    return cloneCommandAttempt(attempt);
  }

  private async loadStoredState(): Promise<void> {
    if (!this.store) return;
    const snapshot = await this.store.load();
    for (const run of snapshot.runs) this.runs.set(run.runId, { ...run, commandIds: [...run.commandIds] });
    for (const attempt of snapshot.commandAttempts) this.commandAttempts.set(attempt.attemptId, cloneCommandAttempt(attempt));
  }

  private persistRun(run: FluxIQRuntimeRun): void {
    if (!this.store) return;
    const saved = { ...run, commandIds: [...run.commandIds] };
    this.pendingWrites = this.pendingWrites.then(() => this.store?.saveRun(saved) ?? Promise.resolve());
  }

  private persistCommandAttempt(attempt: FluxIQRuntimeCommandAttempt): void {
    if (!this.store) return;
    const saved = cloneCommandAttempt(attempt);
    this.pendingWrites = this.pendingWrites.then(() => this.store?.saveCommandAttempt(saved) ?? Promise.resolve());
  }
}

function normalizeId(value: string): string {
  return value.trim().toLowerCase();
}

type RuntimeDispatchTarget =
  | { kind: "adapter"; adapter: FluxIQRuntimeAdapter }
  | { kind: "transport"; transport: import("./contracts.ts").FluxIQRuntimeTransport; client: FluxIQRuntimeClient };

async function adapterMatchesCommand(adapter: FluxIQRuntimeAdapter, command: FluxIQRuntimeCommand): Promise<boolean> {
  if (command.domainId !== undefined && adapter.domainId !== command.domainId) return false;
  if (adapter.canExecute && !await adapter.canExecute(command)) return false;
  const capabilities = await adapter.capabilities();
  return capabilities.some((capability) => capabilityMatchesCommand(capability, command));
}

function runtimeClientMatchesCommand(client: FluxIQRuntimeClient, command: FluxIQRuntimeCommand, context: FluxIQRuntimeDispatchContext): boolean {
  if (client.status !== "ready") return false;
  if (context.preferredClientId && client.clientId !== context.preferredClientId) return false;
  if (context.preferredSessionId && client.sessionId !== context.preferredSessionId) return false;
  if (command.domainId !== undefined && client.domainId !== command.domainId && !client.capabilities.some((capability) => capability.domainId === command.domainId)) return false;
  return client.capabilities.some((capability) => capabilityMatchesCommand(capability, command));
}

function capabilityMatchesCommand(capability: FluxIQRuntimeCapability, command: FluxIQRuntimeCommand): boolean {
  if (command.capabilityId && capability.id !== command.capabilityId) return false;
  if (command.domainId !== undefined && capability.domainId !== undefined && capability.domainId !== command.domainId) return false;
  const outputMatches = command.outputId ? capability.outputIds?.includes(command.outputId) === true : false;
  if (command.actionType && !outputMatches && !capability.actionTypes?.includes(command.actionType)) return false;
  if (command.inputId && !capability.inputIds?.includes(command.inputId)) return false;
  if (command.outputId && !outputMatches) return false;
  if (command.kind === "execute_action") return capability.kind === "action" || capability.kind === "runtime" || capability.kind === "custom";
  if (command.kind === "capture_snapshot") return capability.kind === "snapshot" || capability.kind === "runtime" || capability.kind === "custom";
  if (command.kind === "read_state") return capability.kind === "state" || capability.kind === "runtime" || capability.kind === "custom";
  if (command.kind === "run_flow") return capability.kind === "flow" || capability.kind === "runtime" || capability.kind === "custom";
  return true;
}

function runtimeRunStatusFromCommandStatus(status: FluxIQRuntimeCommandResult["status"]): FluxIQRuntimeRun["status"] {
  if (status === "succeeded") return "succeeded";
  if (status === "cancelled") return "cancelled";
  return "failed";
}

async function withRuntimeBounds(
  run: () => Promise<FluxIQRuntimeCommandResult>,
  command: FluxIQRuntimeCommand & { commandId: string },
  context: FluxIQRuntimeDispatchContext,
  now: () => number
): Promise<FluxIQRuntimeCommandResult> {
  if (context.signal?.aborted) return cancelledResult(command.commandId, now());
  const bounds: Array<Promise<FluxIQRuntimeCommandResult>> = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abortListener: (() => void) | undefined;
  if (command.timeoutMs !== undefined && command.timeoutMs > 0) {
    bounds.push(new Promise((resolve) => {
      timer = setTimeout(() => {
        resolve({
          commandId: command.commandId,
          status: "timed_out",
          completedAt: now(),
          message: `Runtime command timed out after ${command.timeoutMs}ms.`,
          error: `Runtime command timed out after ${command.timeoutMs}ms.`
        });
      }, command.timeoutMs);
    }));
  }
  if (context.signal) {
    bounds.push(new Promise((resolve) => {
      abortListener = () => resolve(cancelledResult(command.commandId, now()));
      context.signal?.addEventListener("abort", abortListener, { once: true });
    }));
  }
  try {
    return bounds.length ? await Promise.race([run(), ...bounds]) : await run();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Runtime command failed.";
    return { commandId: command.commandId, status: "failed", completedAt: now(), message, error: message };
  } finally {
    if (timer) clearTimeout(timer);
    if (context.signal && abortListener) context.signal.removeEventListener("abort", abortListener);
  }
}

function rejectedResult(commandId: string, message: string, completedAt: number): FluxIQRuntimeCommandResult {
  return { commandId, status: "rejected", completedAt, message, error: message };
}

function cancelledResult(commandId: string, completedAt: number): FluxIQRuntimeCommandResult {
  return { commandId, status: "cancelled", completedAt, message: "Runtime command cancelled.", error: "Runtime command cancelled." };
}

function cloneCommandAttempt(attempt: FluxIQRuntimeCommandAttempt): FluxIQRuntimeCommandAttempt {
  return {
    ...attempt,
    command: { ...attempt.command },
    ...(attempt.result ? { result: { ...attempt.result } } : {})
  };
}
