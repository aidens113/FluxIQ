import type { SqlPerformanceMetric } from "./sql.ts";
import type { ProgramEndpointPerformanceMetric } from "./endpoint.ts";

export type FluxIQPerformanceMetric = SqlPerformanceMetric | ProgramEndpointPerformanceMetric;
