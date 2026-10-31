import type { AutomationStudioTargetRefreshResolution } from "./resolution.ts";
import { automationStudioRefreshSnapshot } from "./snapshot.ts";

/** Reads a trusted callback defensively and copies its authority before the host runs. */
export function automationStudioRefreshScope(value: unknown): AutomationStudioTargetRefreshResolution {
  const copied = automationStudioRefreshSnapshot(value);
  if (copied.kind === "unreadable") return { kind: "unreadable", reason: "registry_unreadable" };
  if (copied.kind !== "copied" || !copied.value || typeof copied.value !== "object" || Array.isArray(copied.value)) return { kind: "rejected", reason: "invalid_declaration" };
  const read = copied.value;
  if (read.kind === "absent" && (read.reason === "unregistered_definition" || read.reason === "no_refresh_declaration")) return { kind: "absent", reason: read.reason };
  if (read.kind === "rejected" && (read.reason === "ambiguous_definition" || read.reason === "invalid_declaration" || read.reason === "invalid_output")) return { kind: "rejected", reason: read.reason };
  if (read.kind === "unreadable" && read.reason === "registry_unreadable") return { kind: "unreadable", reason: read.reason };
  const refresh = read.refresh;
  if (read.kind !== "declared" || !refresh || typeof refresh !== "object" || Array.isArray(refresh) || Object.keys(read).some((key) => key !== "kind" && key !== "refresh") || Object.keys(refresh).some((key) => !["container", "definitionId", "definitionVersion", "parameterIds", "removableParameterIds"].includes(key))) return { kind: "rejected", reason: "invalid_declaration" };
  const ids = refresh.parameterIds;
  const removes = refresh.removableParameterIds;
  const validId = (id: unknown): id is string => typeof id === "string" && Boolean(id.trim()) && id === id.trim() && !["__proto__", "constructor", "prototype"].includes(id);
  if ((refresh.container !== "node" && refresh.container !== "output") || !validId(refresh.definitionId) || !validId(refresh.definitionVersion) || !Array.isArray(ids) || !ids.length || !ids.every(validId) || new Set(ids).size !== ids.length || !Array.isArray(removes) || !removes.every(validId) || new Set(removes).size !== removes.length || removes.some((id) => !ids.includes(id))) return { kind: "rejected", reason: "invalid_declaration" };
  return { kind: "declared", refresh: { container: refresh.container, definitionId: refresh.definitionId, definitionVersion: refresh.definitionVersion, parameterIds: ids, removableParameterIds: removes } };
}
