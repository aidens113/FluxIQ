// Provider-neutral, screened records for an unsuccessful provider response.
// This runtime-owned seam is shared by the LLM adapter that produces a refusal
// and Flow Bootstrap diagnostics that persist it. Keeping it outside either
// feature prevents their public barrels from forming an initialization cycle.
export * from "./record.ts";
