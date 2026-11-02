import { AsyncLocalStorage } from "node:async_hooks";
import type { FluxIQPerformanceMetric, SqlPerformanceContext, EndpointScope } from "../types/index.ts";

const MAX_METRICS = 2_000;

const metrics: FluxIQPerformanceMetric[] = [];

const listeners = new Set<(metric: FluxIQPerformanceMetric) => void>();

const sqlContext = new AsyncLocalStorage<SqlPerformanceContext>();

const endpointScope = new AsyncLocalStorage<EndpointScope>();

export const performanceMetricRegistry = Object.freeze({ MAX_METRICS, metrics, listeners, sqlContext, endpointScope });
