// Why a grant refused, as codes rather than sentences: the four refusals a
// grant can give (`refusal.ts`) and, for a refused call, which check gave it
// (`call-refusal.ts`).
//
// A leaf on purpose. The provider contract reads these to keep a grant's
// refusal from being recorded as a provider fault, and the grant service imports
// the provider contract, so anything this directory imported from `runtime/llm/`
// would close a module cycle.
export * from "./call-refusal.ts";
export * from "./refusal.ts";
