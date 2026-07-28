import { randomUUID } from "node:crypto";
import type { JsonObject } from "../../../core";
import { ProgramJsonStore, programDataFile } from "../../_shared/storage";
import type { ComputeCommand, ComputeControlSnapshot, ComputeLease, ComputeNode, ComputeStatus } from "../types";

type ComputeControlState = {
  nodes: ComputeNode[];
  commands: ComputeCommand[];
  leases: ComputeLease[];
};

export class ComputeControlService {
  private readonly nodes = new Map<string, ComputeNode>();
  private readonly commands = new Map<string, ComputeCommand>();
  private readonly leases = new Map<string, ComputeLease>();
  private readonly store?: ProgramJsonStore<ComputeControlState>;
  private loaded = false;

  constructor(options: { dataDir?: string } = {}) {
    if (options.dataDir) {
      this.store = new ProgramJsonStore(programDataFile(options.dataDir, "compute-control", "state.json"), () => ({ nodes: [], commands: [], leases: [] }));
    }
  }

  async upsertNode(node: ComputeNode): Promise<ComputeNode> {
    await this.load();
    const existing = this.nodes.get(node.id);
    const next: ComputeNode = {
      ...existing,
      ...node,
      domainIds: [...new Set(node.domainIds ?? existing?.domainIds ?? [])],
      capabilities: [...new Set(node.capabilities ?? existing?.capabilities ?? [])]
    };
    this.nodes.set(next.id, next);
    await this.persist();
    return next;
  }

  async heartbeat(nodeId: string, status: ComputeStatus = "online", nowMs = Date.now()): Promise<ComputeNode> {
    await this.load();
    const node = this.nodes.get(nodeId);
    if (!node) {
      throw new Error(`Unknown compute node: ${nodeId}`);
    }
    const next = { ...node, status, lastHeartbeatMs: nowMs };
    this.nodes.set(nodeId, next);
    await this.persist();
    return next;
  }

  async enqueueCommand(params: {
    targetComputeId: string;
    kind: ComputeCommand["kind"];
    payload?: JsonObject;
    nowMs?: number;
  }): Promise<ComputeCommand> {
    await this.load();
    if (!this.nodes.has(params.targetComputeId)) {
      throw new Error(`Unknown compute node: ${params.targetComputeId}`);
    }
    const command: ComputeCommand = {
      id: randomUUID(),
      targetComputeId: params.targetComputeId,
      kind: params.kind,
      status: "queued",
      createdAtMs: params.nowMs ?? Date.now()
    };
    if (params.payload) {
      command.payload = params.payload;
    }
    this.commands.set(command.id, command);
    await this.persist();
    return command;
  }

  async pollCommands(nodeId: string, limit = 10, nowMs = Date.now()): Promise<ComputeCommand[]> {
    await this.load();
    if (!this.nodes.has(nodeId)) throw new Error(`Unknown compute node: ${nodeId}`);
    const commands = [...this.commands.values()]
      .filter((command) => command.targetComputeId === nodeId && (!command.status || command.status === "queued"))
      .sort((left, right) => left.createdAtMs - right.createdAtMs)
      .slice(0, Math.max(1, Math.min(100, limit)))
      .map((command) => ({ ...command, status: "claimed" as const, claimedAtMs: nowMs }));
    for (const command of commands) this.commands.set(command.id, command);
    await this.persist();
    return commands;
  }

  async completeCommand(params: { commandId: string; ok: boolean; result?: JsonObject; error?: string; nowMs?: number }): Promise<ComputeCommand> {
    await this.load();
    const command = this.commands.get(params.commandId);
    if (!command) throw new Error(`Unknown compute command: ${params.commandId}`);
    const next: ComputeCommand = {
      ...command,
      status: params.ok ? "succeeded" : "failed",
      completedAtMs: params.nowMs ?? Date.now()
    };
    if (params.result) next.result = params.result;
    if (params.error) next.error = params.error;
    this.commands.set(next.id, next);
    await this.persist();
    return next;
  }

  async acquireLease(params: {
    computeId: string;
    holder: string;
    purpose: string;
    ttlMs: number;
    nowMs?: number;
  }): Promise<ComputeLease> {
    await this.load();
    if (!this.nodes.has(params.computeId)) {
      throw new Error(`Unknown compute node: ${params.computeId}`);
    }
    const nowMs = params.nowMs ?? Date.now();
    const existing = [...this.leases.values()].find(
      (lease) => lease.computeId === params.computeId && lease.purpose === params.purpose && lease.expiresAtMs > nowMs
    );
    if (existing) return existing;
    const lease: ComputeLease = {
      id: randomUUID(),
      computeId: params.computeId,
      holder: params.holder,
      purpose: params.purpose,
      expiresAtMs: nowMs + params.ttlMs
    };
    this.leases.set(lease.id, lease);
    await this.persist();
    return lease;
  }

  async releaseLease(leaseId: string): Promise<boolean> {
    await this.load();
    const released = this.leases.delete(leaseId);
    await this.persist();
    return released;
  }

  async snapshot(nowMs = Date.now()): Promise<ComputeControlSnapshot> {
    await this.load();
    return {
      nodes: [...this.nodes.values()].sort((left, right) => left.label.localeCompare(right.label)),
      commands: [...this.commands.values()].sort((left, right) => right.createdAtMs - left.createdAtMs),
      leases: [...this.leases.values()]
        .filter((lease) => lease.expiresAtMs > nowMs)
        .sort((left, right) => left.expiresAtMs - right.expiresAtMs)
    };
  }

  private async load(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    if (!this.store) return;
    const state = await this.store.read();
    for (const node of state.nodes) this.nodes.set(node.id, node);
    for (const command of state.commands) this.commands.set(command.id, command);
    for (const lease of state.leases) this.leases.set(lease.id, lease);
  }

  private async persist(): Promise<void> {
    if (!this.store) return;
    await this.store.write({
      nodes: [...this.nodes.values()],
      commands: [...this.commands.values()].sort((left, right) => right.createdAtMs - left.createdAtMs).slice(0, 500),
      leases: [...this.leases.values()]
    });
  }
}
