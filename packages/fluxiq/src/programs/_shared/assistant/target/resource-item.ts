import type { ProgramResourceRef } from "../../iam/index.ts";
import type { AssistantTargetItem } from "../types.ts";

const CHILD: Readonly<Record<string, Omit<AssistantTargetItem, "id">>> = { flow: { kind: "Flow", contextKey: "flowId" }, run: { kind: "run", contextKey: "runId" }, dataset: { kind: "dataset", contextKey: "datasetId" }, recording: { kind: "recording" } };

/**
 * One IAM resource as a person names it, or undefined for one nobody could:
 * the workspace, the program, oneself, or a ref whose id is missing.
 */
export function assistantResourceItem(ref: ProgramResourceRef): AssistantTargetItem | undefined {
  if (ref.kind === "project-child") {
    const childId = idOf(ref.childId);
    const projectId = idOf(ref.projectId);
    return childId === undefined || projectId === undefined || !Object.hasOwn(CHILD, ref.child) ? undefined : { ...CHILD[ref.child]!, id: childId, projectId };
  }
  const single: Partial<Record<ProgramResourceRef["kind"], [unknown, Omit<AssistantTargetItem, "id">]>> = {
    project: ["projectId" in ref ? ref.projectId : undefined, { kind: "project", contextKey: "projectId" }],
    key: ["keyId" in ref ? ref.keyId : undefined, { kind: "key", contextKey: "keyId" }],
    client: ["clientId" in ref ? ref.clientId : undefined, { kind: "connected browser" }],
    schedule: ["scheduleId" in ref ? ref.scheduleId : undefined, { kind: "schedule" }],
    user: ["userId" in ref ? ref.userId : undefined, { kind: "person" }]
  };
  const [raw, named] = single[ref.kind] ?? [undefined, undefined];
  const id = idOf(raw);
  return id === undefined || named === undefined ? undefined : { ...named, id };
}

function idOf(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
