// Logical origin, never current list position or mapped input equality, identifies a call occurrence.
import { canonicalJson } from "@fluxiq/contracts/fluxnode";
import { PipelineError } from "../errors.ts";
import type { PipelineCallInvocation, PipelineRecord } from "../types.ts";

export function pipelineMapInvocations(stepId: string, records: readonly PipelineRecord[]): PipelineCallInvocation[] {
  const occurrences = new Map<string, number>();
  return records.map((record) => {
    const origin = record.lineage.find((entry) => entry.pointer === "" && entry.source.kind !== "derived");
    if (!origin) throw new PipelineError("pipeline.no_invocation_origin", "A mapped call needs its preserved source occurrence.", stepId);
    const identity = canonicalJson({ source: origin.source, stepId: origin.stepId ?? null });
    const occurrence = (occurrences.get(identity) ?? 0) + 1;
    occurrences.set(identity, occurrence);
    return { stepId, invocationId: canonicalJson({ identity, occurrence }) };
  });
}
