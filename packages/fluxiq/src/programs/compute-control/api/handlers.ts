import type { GlobalProgramApiRegistry } from "../../_shared/api";
import {
  COMPUTE_CONTROL_ENDPOINTS,
  type AcquireComputeLeaseRequest,
  type CompleteComputeCommandRequest,
  type ComputeControlCommandRequest,
  type ComputeHeartbeatRequest,
  type PollComputeCommandsRequest,
  type RegisterComputeNodeRequest,
  type ReleaseComputeLeaseRequest
} from "./contracts";
import type { ComputeControlService } from "../runtime/service";

export function registerComputeControlApi(registry: GlobalProgramApiRegistry, service: ComputeControlService): void {
  registry.register({
    programId: "compute-control",
    endpoint: COMPUTE_CONTROL_ENDPOINTS.snapshot,
    handler: async () => ({ ok: true, payload: await service.snapshot() })
  });
  registry.register({
    programId: "compute-control",
    endpoint: COMPUTE_CONTROL_ENDPOINTS.registerNode,
    handler: async (request) => {
      const payload = request.payload as RegisterComputeNodeRequest | undefined;
      if (!payload?.id || !payload.label) return { ok: false, error: "id and label are required" };
      return { ok: true, payload: await service.upsertNode(payload) };
    }
  });
  registry.register({
    programId: "compute-control",
    endpoint: COMPUTE_CONTROL_ENDPOINTS.heartbeat,
    handler: async (request) => {
      const payload = request.payload as ComputeHeartbeatRequest | undefined;
      if (!payload?.nodeId) return { ok: false, error: "nodeId is required" };
      return { ok: true, payload: await service.heartbeat(payload.nodeId, payload.status) };
    }
  });
  registry.register({
    programId: "compute-control",
    endpoint: COMPUTE_CONTROL_ENDPOINTS.command,
    handler: async (request) => {
      const payload = request.payload as ComputeControlCommandRequest | undefined;
      if (!payload?.targetComputeId || !payload.kind) {
        return { ok: false, error: "targetComputeId and kind are required" };
      }
      return { ok: true, payload: await service.enqueueCommand(payload) };
    }
  });
  registry.register({
    programId: "compute-control",
    endpoint: COMPUTE_CONTROL_ENDPOINTS.pollCommands,
    handler: async (request) => {
      const payload = request.payload as PollComputeCommandsRequest | undefined;
      if (!payload?.nodeId) return { ok: false, error: "nodeId is required" };
      return { ok: true, payload: await service.pollCommands(payload.nodeId, payload.limit) };
    }
  });
  registry.register({
    programId: "compute-control",
    endpoint: COMPUTE_CONTROL_ENDPOINTS.completeCommand,
    handler: async (request) => {
      const payload = request.payload as CompleteComputeCommandRequest | undefined;
      if (!payload?.commandId) return { ok: false, error: "commandId is required" };
      return { ok: true, payload: await service.completeCommand(payload) };
    }
  });
  registry.register({
    programId: "compute-control",
    endpoint: COMPUTE_CONTROL_ENDPOINTS.acquireLease,
    handler: async (request) => {
      const payload = request.payload as AcquireComputeLeaseRequest | undefined;
      if (!payload?.computeId || !payload.holder || !payload.purpose || !payload.ttlMs) {
        return { ok: false, error: "computeId, holder, purpose, and ttlMs are required" };
      }
      return { ok: true, payload: await service.acquireLease(payload) };
    }
  });
  registry.register({
    programId: "compute-control",
    endpoint: COMPUTE_CONTROL_ENDPOINTS.releaseLease,
    handler: async (request) => {
      const payload = request.payload as ReleaseComputeLeaseRequest | undefined;
      if (!payload?.leaseId) return { ok: false, error: "leaseId is required" };
      return { ok: true, payload: { released: await service.releaseLease(payload.leaseId) } };
    }
  });
}
