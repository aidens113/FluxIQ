import type { ProgramEndpointPerformanceMetric } from "../types/index.ts";
import { publishPerformanceMetric } from "../registry/index.ts";

export function recordProgramEndpointPerformance(metric: Omit<ProgramEndpointPerformanceMetric, "kind" | "recordedAt">): void {
  publishPerformanceMetric({ kind: "endpoint", ...metric, recordedAt: Date.now() });
}
