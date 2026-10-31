import type { JsonObject } from "../../../../../core/index.ts";
import { automationStudioLlmEvidenceCanonicalJson } from "../evidence-loop-decision.ts";
import {
  automationStudioLlmRunNodesFreeze,
  automationStudioLlmRunNodesJsonObject,
  automationStudioLlmRunNodesReadReceipt
} from "../node-reruns/index.ts";
import { AUTOMATION_STUDIO_FLOW_DRAFT_REPLAY_PRESENT_CODE, AUTOMATION_STUDIO_FLOW_DRAFT_REPLAY_VERIFIED_CODE } from "../../flow-draft/index.ts";
import type {
  AutomationStudioLlmRerunCaptureSnapshot,
  AutomationStudioLlmRerunDispatchAttempt,
  AutomationStudioLlmRerunResult,
  AutomationStudioLlmRerunUnavailable
} from "./types.ts";

export type AutomationStudioLlmRerunFrozenSnapshot = Readonly<{
  snapshot: AutomationStudioLlmRerunCaptureSnapshot;
  adapterKey: string;
}>;

/** Existing JSON reader + structuredClone: no serializer clone or producer freezing. */
export function automationStudioLlmRerunJsonSnapshot(value: JsonObject): Readonly<{ kind: "valid"; value: JsonObject; key: string }> | AutomationStudioLlmRerunUnavailable {
  try {
    if (!dataTree(value) || !automationStudioLlmRunNodesJsonObject(value)) return unavailable("invalid_snapshot");
    const clone = automationStudioLlmRunNodesFreeze(structuredClone(value));
    return Object.freeze({ kind: "valid", value: clone, key: automationStudioLlmEvidenceCanonicalJson(clone) });
  } catch {
    // A host object that cannot be read/copied is explicitly unproven, never {}.
    return unavailable("invalid_snapshot");
  }
}

/** Opaque host identities are retained by reference; their mutable graphs are never read. */
export function automationStudioLlmRerunReadSnapshot(value: AutomationStudioLlmRerunCaptureSnapshot): AutomationStudioLlmRerunFrozenSnapshot | AutomationStudioLlmRerunUnavailable {
  try {
    const fields = Object.getOwnPropertyDescriptors(value);
    const own = (name: string) => data(fields, name);
    if (!Object.hasOwn(fields, "effectiveInputs")) return unavailable("effective_inputs_unproven");
    if (!identity(own("owner")) || !identity(own("generation")) || !identity(own("subject")) || !identity(own("capsule"))) return unavailable("invalid_snapshot");
    if (!code(own("definitionId")) || !code(own("definitionVersion"))) return unavailable("invalid_snapshot");
    const referenceNow = own("referenceNow");
    if (typeof referenceNow !== "number" || !Number.isFinite(referenceNow) || referenceNow < 0) return unavailable("invalid_snapshot");
    const inputs = automationStudioLlmRerunJsonSnapshot(own("effectiveInputs") as JsonObject);
    if (inputs.kind !== "valid") return unavailable("effective_inputs_unproven");
    const parameters = automationStudioLlmRerunJsonSnapshot(own("parameters") as JsonObject);
    const adapter = automationStudioLlmRerunJsonSnapshot(own("adapterValue") as JsonObject);
    if (parameters.kind !== "valid" || adapter.kind !== "valid") return unavailable("invalid_snapshot");
    const dispatch = readDispatch(own("dispatch"));
    if (dispatch.kind === "unavailable") return dispatch;
    const snapshot: AutomationStudioLlmRerunCaptureSnapshot = Object.freeze({
      owner: own("owner") as object,
      generation: own("generation") as object,
      definitionId: own("definitionId") as string,
      definitionVersion: own("definitionVersion") as string,
      parameters: parameters.value,
      effectiveInputs: inputs.value,
      adapterValue: adapter.value,
      referenceNow,
      subject: own("subject") as object,
      capsule: own("capsule") as object,
      dispatch: dispatch.value
    });
    return Object.freeze({ snapshot, adapterKey: adapter.key });
  } catch {
    return unavailable("invalid_snapshot");
  }
}

/** The actual outer result, not adapter capture, establishes positive settlement. */
export function automationStudioLlmRerunReadSettlement(value: AutomationStudioLlmRerunResult): Readonly<{ kind: "valid"; execution: AutomationStudioLlmRerunResult; resultCode: string | undefined }> | AutomationStudioLlmRerunUnavailable {
  try {
    if (!dataTree(value, true)) return unavailable("result_unproven");
    const read = automationStudioLlmRunNodesReadReceipt(value);
    if (read.kind !== "succeeded") return unavailable("result_unproven");
    if (read.resultCode === AUTOMATION_STUDIO_FLOW_DRAFT_REPLAY_VERIFIED_CODE || read.resultCode === AUTOMATION_STUDIO_FLOW_DRAFT_REPLAY_PRESENT_CODE) return unavailable("result_unproven");
    const fields = Object.getOwnPropertyDescriptors(value as object);
    const personNeeded = data(fields, "personNeeded");
    if (personNeeded !== undefined && personNeeded !== false) return unavailable("result_unproven");
    const draft = data(fields, "draft");
    if (draft && typeof draft === "object" && data(Object.getOwnPropertyDescriptors(draft), "written") === true) return unavailable("result_unproven");
    return Object.freeze({ kind: "valid", execution: automationStudioLlmRunNodesFreeze(structuredClone(value)), resultCode: read.resultCode });
  } catch {
    return unavailable("result_unproven");
  }
}

function readDispatch(value: unknown): Readonly<{ kind: "valid"; value: AutomationStudioLlmRerunCaptureSnapshot["dispatch"] }> | AutomationStudioLlmRerunUnavailable {
  if (!value || typeof value !== "object") return unavailable("dispatch_unproven");
  const fields = Object.getOwnPropertyDescriptors(value);
  const attempts = data(fields, "attempts");
  const selected = data(fields, "selected");
  if (!Array.isArray(attempts) || attempts.length === 0 || !identity(selected)) return unavailable("dispatch_unproven");
  const seen = new Set<object>();
  const copied: AutomationStudioLlmRerunDispatchAttempt[] = [];
  for (let index = 0; index < attempts.length; index++) {
    const attempt = Object.getOwnPropertyDescriptor(attempts, String(index))?.value as unknown;
    if (!attempt || typeof attempt !== "object") return unavailable("dispatch_unproven");
    const members = Object.getOwnPropertyDescriptors(attempt);
    const attemptIdentity = data(members, "identity");
    const receipt = data(members, "receipt");
    const outcome = data(members, "outcome");
    if (!identity(attemptIdentity) || seen.has(attemptIdentity) || (receipt !== undefined && !identity(receipt))) return unavailable("dispatch_unproven");
    if (outcome !== "succeeded" && outcome !== "failed_unacted") return unavailable("dispatch_unproven");
    seen.add(attemptIdentity);
    const copy: AutomationStudioLlmRerunDispatchAttempt = receipt === undefined
      ? Object.freeze({ identity: attemptIdentity, outcome })
      : Object.freeze({ identity: attemptIdentity, receipt, outcome });
    copied.push(copy);
  }
  const last = copied[copied.length - 1];
  if (!last || last.identity !== selected || last.outcome !== "succeeded" || !last.receipt) return unavailable("dispatch_unproven");
  return Object.freeze({ kind: "valid", value: Object.freeze({ attempts: Object.freeze(copied), selected }) });
}

function data(fields: Record<string, PropertyDescriptor>, name: string): unknown {
  const descriptor = fields[name];
  return descriptor && Object.hasOwn(descriptor, "value") ? descriptor.value : undefined;
}

function identity(value: unknown): value is object {
  return value !== null && (typeof value === "object" || typeof value === "function");
}

function code(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.trim() === value && !/\s/u.test(value);
}

/** Inspect descriptors before the canonical reader: no accessors, cycles or sparse arrays. */
function dataTree(value: unknown, optionalUndefined = false, parents = new Set<object>(), depth = 0): boolean {
  if (value === undefined) return optionalUndefined;
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object" || depth > 64 || parents.has(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (Array.isArray(value) ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) return false;
  if (Object.getOwnPropertySymbols(value).length > 0) return false;
  const fields = Object.getOwnPropertyDescriptors(value);
  if (Array.isArray(value)) {
    if (Object.keys(fields).length !== value.length + 1) return false;
    for (let index = 0; index < value.length; index++) if (!Object.hasOwn(fields, String(index))) return false;
  }
  parents.add(value);
  for (const [key, member] of Object.entries(fields)) {
    if (Array.isArray(value) && key === "length") continue;
    if (!Object.hasOwn(member, "value") || !member.enumerable || !dataTree(member.value, optionalUndefined, parents, depth + 1)) return false;
  }
  parents.delete(value);
  return true;
}

function unavailable(reason: AutomationStudioLlmRerunUnavailable["reason"]): AutomationStudioLlmRerunUnavailable {
  return Object.freeze({ kind: "unavailable", reason });
}
