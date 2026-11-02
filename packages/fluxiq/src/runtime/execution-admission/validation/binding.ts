import type { ExecutionScopeBinding } from "../contracts/index.ts";
import { executionRecord } from "./record.ts";
import { executionResources } from "./resources.ts";
import { executionText } from "./text.ts";

export function executionBinding(value: unknown): ExecutionScopeBinding {
  const keys = ["projectId", "ownerKey", "continuationKey", "resourceKeys", "coverageEpoch"];
  const row = executionRecord(value, keys, keys, "binding");
  return Object.freeze({
    projectId: executionText(row.projectId, "project"),
    ownerKey: executionText(row.ownerKey, "owner"),
    continuationKey: executionText(row.continuationKey, "continuation"),
    resourceKeys: executionResources(row.resourceKeys),
    coverageEpoch: executionText(row.coverageEpoch, "epoch")
  });
}
