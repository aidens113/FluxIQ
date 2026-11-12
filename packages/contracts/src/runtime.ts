// Browser-safe failure and target-actionability contracts for any runtime consumer.
export * from "./failure/index.ts";
export * from "./actionability/index.ts";
// Humanness: a run option every runtime reads (its bounds, schema, normalizer and seeded generator), also on `./automation`.
export * from "./humanness/index.ts";
