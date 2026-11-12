import type { FluxIQRuntimeCapability, FluxIQRuntimeClient, FluxIQRuntimeCommand, FluxIQRuntimeRun, FluxIQRuntimeTransportKind } from "fluxiq/runtime";

type Row = { key: string; id: string; label: string; status: string; kind: string; values: Array<[string, string]>; runId: string; search: string; sortAt: number };
const transports: readonly FluxIQRuntimeTransportKind[] = ["direct", "websocket", "native", "worker", "remote", "custom"];
const clients: readonly FluxIQRuntimeClient["status"][] = ["available", "pairing_required", "ready", "busy", "offline"];
const capabilities: readonly FluxIQRuntimeCapability["kind"][] = ["recording", "snapshot", "action", "state", "flow", "native-node", "runtime", "custom"];
const runs: readonly FluxIQRuntimeRun["status"][] = ["queued", "running", "waiting", "succeeded", "failed", "cancelled"];
const commands: readonly FluxIQRuntimeCommand["kind"][] = ["execute_action", "capture_snapshot", "read_state", "run_flow", "custom"];
const attempts = ["dispatched", "succeeded", "failed", "timed_out", "cancelled", "rejected", "unknown"];
const record = (value: unknown): Record<string, unknown> | null => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const text = (value: unknown) => typeof value === "string" && value.length > 0 && value.length <= 200 && !/[\u0000-\u001f\u007f]/u.test(value) ? value : "";
const member = (value: unknown, values: readonly string[]) => typeof value === "string" && values.includes(value) ? value : "";
const timestamp = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 8_640_000_000_000_000 ? value : 0;
const time = (value: unknown) => timestamp(value) ? new Date(timestamp(value)).toISOString() : "-";
const ids = (value: unknown) => Array.isArray(value) ? value.slice(0, 20).map(text).filter(Boolean).join(", ") + (value.length > 20 ? ` (first 20 of ${value.length})` : "") : "-";
function row(id: string, label: string, kind: string, status: string, values: Array<[string, string]>, key = id, runId = "", sortAt = 0): Row {
  return { key, id, label: label || id, kind, status, values, runId, sortAt, search: [id, label, kind, status, ...values.map((entry) => entry[1])].join(" ").toLocaleLowerCase() };
}

/** Structural display projection; arbitrary runtime payloads never enter UI state. */
export function projectRuntimeSnapshot(payload: unknown) {
  const source = record(payload);
  const runtimeId = text(source?.runtimeId);
  if (!source || !runtimeId || !["clients", "capabilities", "runs", "commandAttempts", "adapters", "transports"].every((key) => Array.isArray(source[key]))) return null;
  const project = (name: string, convert: (entry: Record<string, unknown>) => Row | null) => (source[name] as unknown[]).map((value) => {
    const entry = record(value);
    return entry ? convert(entry) : null;
  });
  const clientRows = project("clients", (entry) => {
    const id = text(entry.clientId), status = member(entry.status, clients), kind = member(entry.transport, transports);
    return id && status && kind ? row(id, text(entry.label), kind, status, [["Client", id], ["Session", text(entry.sessionId) || "-"], ["Domain", text(entry.domainId) || "-"], ["Connected", time(entry.connectedAt)], ["Last seen", time(entry.lastSeenAt)], ["Capabilities", String(Array.isArray(entry.capabilities) ? entry.capabilities.length : 0)]], JSON.stringify([id, text(entry.sessionId), kind])) : null;
  });
  const capabilityRows = project("capabilities", (entry) => {
    const id = text(entry.id), kind = member(entry.kind, capabilities);
    return id && kind ? row(id, text(entry.label), kind, "registered", [["Capability", id], ["Domain", text(entry.domainId) || "-"], ["Action types", ids(entry.actionTypes)], ["Input ids", ids(entry.inputIds)], ["Output ids", ids(entry.outputIds)]]) : null;
  });
  const runRows = project("runs", (entry) => {
    const id = text(entry.runId), status = member(entry.status, runs), kind = member(entry.targetKind, ["flow", "node", "command", "recording", "custom"]), target = text(entry.targetId);
    return id && status && kind && target ? row(id, target, kind, status, [["Run", id], ["Target", target], ["Project", text(entry.projectId) || "-"], ["Domain", text(entry.domainId) || "-"], ["Queued", time(entry.queuedAt)], ["Started", time(entry.startedAt)], ["Finished", time(entry.finishedAt)], ["Selected client", text(entry.selectedClientId) || "No selected route recorded"], ["Selected session", text(entry.selectedSessionId) || "-"], ["Transport", member(entry.transport, transports) || "-"], ["Commands", String(Array.isArray(entry.commandIds) ? entry.commandIds.length : 0)]], id, id, timestamp(entry.queuedAt)) : null;
  });
  const dispatchRows = project("commandAttempts", (entry) => {
    const command = record(entry.command), id = text(entry.attemptId), commandId = text(entry.commandId), status = member(entry.status, attempts), kind = member(command?.kind, commands);
    return id && commandId && status && kind ? row(id, commandId, kind, status, [["Attempt", id], ["Command", commandId], ["Run", text(entry.runId) || "-"], ["Capability", text(command?.capabilityId) || "-"], ["Action type", text(command?.actionType) || "-"], ["Input", text(command?.inputId) || "-"], ["Output", text(command?.outputId) || "-"], ["Adapter", text(entry.adapterId) || "-"], ["Client", text(entry.clientId) || "-"], ["Session", text(entry.sessionId) || "-"], ["Transport", member(entry.transport, transports) || "No selected route recorded"], ["Dispatched", time(entry.dispatchedAt)], ["Settled", time(entry.settledAt)]], id, text(entry.runId), timestamp(entry.dispatchedAt)) : null;
  });
  const adapterRows = project("adapters", (entry) => {
    const id = text(entry.adapterId), kind = member(entry.transport, transports);
    return id && kind ? row(id, text(entry.label), kind, "adapter", [["Adapter", id], ["Domain", text(entry.domainId) || "-"], ["Capabilities", String(Array.isArray(entry.capabilities) ? entry.capabilities.length : 0)]], "adapter:" + id) : null;
  });
  const transportRows = project("transports", (entry) => {
    const id = text(entry.transportId), kind = member(entry.kind, transports);
    return id && kind ? row(id, text(entry.label), kind, "transport", [["Transport", id], ["Clients", String(Array.isArray(entry.clients) ? entry.clients.length : 0)]], "transport:" + id) : null;
  });
  const all = [...clientRows, ...capabilityRows, ...runRows, ...dispatchRows, ...adapterRows, ...transportRows];
  if (all.some((entry) => !entry)) return null;
  const newest = (left: Row, right: Row) => right.sortAt - left.sortAt || left.id.localeCompare(right.id);
  return { runtimeId, clients: clientRows as Row[], capabilities: capabilityRows.map((entry, index) => ({ ...entry!, key: JSON.stringify([entry!.id, index]) })), runs: (runRows as Row[]).sort(newest), dispatch: (dispatchRows as Row[]).sort(newest), transports: [...adapterRows, ...transportRows] as Row[] };
}
