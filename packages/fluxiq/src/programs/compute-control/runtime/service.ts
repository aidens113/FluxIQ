import { randomUUID } from "node:crypto";
import type { JsonObject } from "../../../core";
import type { ComputeCommand, ComputeControlSnapshot, ComputeLease, ComputeNode, ComputeStatus } from "../types";

export class ComputeControlService {
  private readonly nodes = new Map<string, ComputeNode>();
  private readonly commands = new Map<string, ComputeCommand>();
  private readonly leases = new Map<string, ComputeLease>();

  upsertNode(node: ComputeNode): ComputeNode {
    const existing = this.nodes.get(node.id);
    const next: ComputeNode = {
      ...existing,
      ...node,
      domainIds: [...new Set(node.domainIds)],
      capabilities: [...new Set(node.capabilities)]
    };
    this.nodes.set(next.id, next);
    return next;
  }

  heartbeat(nodeId: string, status: ComputeStatus = "online", nowMs = Date.now()): ComputeNode {
    const node = this.nodes.get(nodeId);
    if (!node) {
      throw new Error(`Unknown compute node: ${nodeId}`);
    }
    const next = { ...node, status, lastHeartbeatMs: nowMs };
    this.nodes.set(nodeId, next);
    return next;
  }

  enqueueCommand(params: {
    targetComputeId: string;
    kind: ComputeCommand["kind"];
    payload?: JsonObject;
    nowMs?: number;
  }): ComputeCommand {
    if (!this.nodes.has(params.targetComputeId)) {
      throw new Error(`Unknown compute node: ${params.targetComputeId}`);
    }
    const command: ComputeCommand = {
      id: randomUUID(),
      targetComputeId: params.targetComputeId,
      kind: params.kind,
      createdAtMs: params.nowMs ?? Date.now()
    };
    if (params.payload) {
      command.payload = params.payload;
    }
    this.commands.set(command.id, command);
    return command;
  }

  acquireLease(params: {
    computeId: string;
    holder: string;
    purpose: string;
    ttlMs: number;
    nowMs?: number;
  }): ComputeLease {
    if (!this.nodes.has(params.computeId)) {
      throw new Error(`Unknown compute node: ${params.computeId}`);
    }
    const lease: ComputeLease = {
      id: randomUUID(),
      computeId: params.computeId,
      holder: params.holder,
      purpose: params.purpose,
      expiresAtMs: (params.nowMs ?? Date.now()) + params.ttlMs
    };
    this.leases.set(lease.id, lease);
    return lease;
  }

  releaseLease(leaseId: string): boolean {
    return this.leases.delete(leaseId);
  }

  snapshot(nowMs = Date.now()): ComputeControlSnapshot {
    return {
      nodes: [...this.nodes.values()].sort((left, right) => left.label.localeCompare(right.label)),
      commands: [...this.commands.values()].sort((left, right) => right.createdAtMs - left.createdAtMs),
      leases: [...this.leases.values()]
        .filter((lease) => lease.expiresAtMs > nowMs)
        .sort((left, right) => left.expiresAtMs - right.expiresAtMs)
    };
  }
}
