// Barrel for `@fluxiq/contracts/fluxnode`: the contracts every FluxNode lane builds
// against (plan, P1). Browser-safe: zod and the platform's own `URL`, `TextEncoder`
// and `crypto.subtle`, no Node built-in.
//
// - exact types: the JSON Schema subset, its parser, validator and canonical form;
// - Flows: paths, automatic placement, FluxNode names, Call Flow, a Flow's interface;
// - the FluxNode spec, its options, scope, goal placeholders and spec hash;
// - runs: request, result, verdict, cost, events, answers and error codes;
// - data: lineage, dataset references, expressions, data steps, sinks and pipelines;
// - the HTTP API: paths and every request and response body.
//
// The zod bridge in `./issue/` is internal: only the issue shapes are re-exported.
export * from "./data/index.ts";
export * from "./fields/index.ts";
export * from "./flow/index.ts";
export * from "./http/index.ts";
export type { FluxNodeIssue, FluxNodeIssuePath, FluxNodeParseResult } from "./issue/index.ts";
export * from "./json/index.ts";
export * from "./run/index.ts";
export * from "./spec/index.ts";
export * from "./type-schema/index.ts";
