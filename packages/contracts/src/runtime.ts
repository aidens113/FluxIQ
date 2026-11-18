// Browser-safe failure and target-actionability contracts for any runtime consumer.
export * from "./failure/index.ts";
export * from "./actionability/index.ts";
// Humanness: a run option every runtime reads (its bounds, normalizer, seeded generator and precedence resolver),
// also on `./automation`. Its zod schema lives in `humanness/schema/` and is exported on `./automation` only, so this
// entry stays the neutral, dependency-free boundary src/tests/runtime.test.ts compiles with no packages.
export * from "./humanness/index.ts";
