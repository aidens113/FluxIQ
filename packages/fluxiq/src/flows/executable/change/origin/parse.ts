import type { ExecutableChangeOrigin } from "./origin.ts";
import { hasOnlyKeys, isOriginText } from "../validation/index.ts";

const ORIGIN_ID_MAX_LENGTH = 256;
const ORIGIN_SIGNATURE_MAX_LENGTH = 512;
const ORIGIN_MAX_INSTRUCTION_IDS = 64;

export function parseExecutableChangeOrigin(value: unknown): ExecutableChangeOrigin | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (record.entryPoint === "instruction") {
    if (!hasOnlyKeys(keys, ["entryPoint", "instructionIds"])) return undefined;
    const instructionIds = originIdList(record.instructionIds);
    return instructionIds?.length ? { entryPoint: "instruction", instructionIds } : undefined;
  }
  if (record.entryPoint === "run_failure") {
    if (!hasOnlyKeys(keys, ["entryPoint", "runId", "failedNodeId", "failureSignature"])) return undefined;
    const { runId, failedNodeId, failureSignature } = record;
    if (!isOriginText(runId, ORIGIN_ID_MAX_LENGTH) || !isOriginText(failedNodeId, ORIGIN_ID_MAX_LENGTH) || !isOriginText(failureSignature, ORIGIN_SIGNATURE_MAX_LENGTH)) return undefined;
    return { entryPoint: "run_failure", runId, failedNodeId, failureSignature };
  }
  if (record.entryPoint === "edge_case") {
    if (!hasOnlyKeys(keys, ["entryPoint", "instructionIds", "runId", "failureSignature"])) return undefined;
    const instructionIds = originIdList(record.instructionIds);
    const { runId, failureSignature } = record;
    if (!instructionIds) return undefined;
    if (runId !== undefined && !isOriginText(runId, ORIGIN_ID_MAX_LENGTH)) return undefined;
    if (failureSignature !== undefined && (runId === undefined || !isOriginText(failureSignature, ORIGIN_SIGNATURE_MAX_LENGTH))) return undefined;
    if (!instructionIds.length && runId === undefined) return undefined;
    return {
      entryPoint: "edge_case",
      instructionIds,
      ...(typeof runId === "string" ? { runId } : {}),
      ...(typeof failureSignature === "string" ? { failureSignature } : {})
    };
  }
  return undefined;
}

function originIdList(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || value.length > ORIGIN_MAX_INSTRUCTION_IDS) return undefined;
  if (!value.every((entry) => isOriginText(entry, ORIGIN_ID_MAX_LENGTH)) || new Set(value).size !== value.length) return undefined;
  return [...value] as string[];
}
