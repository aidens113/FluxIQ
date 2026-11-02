// Compatibility aliases; the framework owns the one metrics registry and contexts.
export { withSqlPerformanceContext, withEndpointPerformanceScope, recordSqlPerformance, recordProgramEndpointPerformance, fluxiqPerformanceMetricsSnapshot, clearFluxIQPerformanceMetrics, subscribeFluxIQPerformanceMetrics, serializedMetricBytes } from "../../framework/observability/performance/index.ts";
export type { SqlPerformanceMetric, ProgramEndpointPerformanceMetric, FluxIQPerformanceMetric, SqlPerformanceContext } from "../../framework/observability/performance/index.ts";
