import type { ComputeControlSnapshotResponse } from "fluxiq/compute-control";
import { payloadFields as p } from "./primitives";
export function validateComputeSnapshot(value: unknown): value is ComputeControlSnapshotResponse {
  return p.record(value) && Array.isArray(value.nodes) && Array.isArray(value.commands) && Array.isArray(value.leases)
    && value.nodes.every(node => p.record(node) && p.string(node.id) && p.string(node.label) && p.string(node.status) && p.strings(node.domainIds) && p.strings(node.capabilities) && p.optionalString(node.host) && p.optionalNumber(node.lastHeartbeatMs) && p.optionalRecord(node.metadata))
    && value.commands.every(command => p.record(command) && p.string(command.id) && p.string(command.targetComputeId) && p.string(command.kind) && p.number(command.createdAtMs) && p.optionalString(command.status) && p.optionalString(command.error))
    && value.leases.every(lease => p.record(lease) && p.string(lease.id) && p.string(lease.computeId) && p.string(lease.holder) && p.string(lease.purpose) && p.number(lease.expiresAtMs));
}
