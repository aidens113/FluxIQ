import type { AutomationStudioResultNoWeighed } from "../refuted-no/index.ts";
import { PART_CONTRADICTED } from "./contradicted-labels.ts";
import type { JudgeReading } from "./types.ts";

/**
 * A no's reading labelled with what Core's record refutes of it (header, t628),
 * as t501 labels a reading: its call and Core's findings, then its own words,
 * unchanged. Wholly refuted, it is "contradicted"; otherwise the label says the
 * record contradicts part of it, and the rest stands. `expected` restates the
 * request and is left as it is.
 */
export function refutedLabelled(reading: JudgeReading, refuted: { call: 1 | 2 } & AutomationStudioResultNoWeighed): JudgeReading {
  const label = refuted.wholly
    ? `Judge call ${refuted.call} (contradicted by Core's record: ${refuted.findings.join(" ")})`
    : `Judge call ${refuted.call} (${PART_CONTRADICTED}: ${refuted.findings.join(" ")})`;
  return {
    ...reading,
    ...(reading.observed ? { observed: `${label}: ${reading.observed}` } : {}),
    ...(reading.advice ? { advice: `${label}: ${reading.advice}` } : {}),
    // The fact beside the label, for a gate to read (header, t641).
    recordContradicts: refuted.wholly ? "whole" : "part"
  };
}
