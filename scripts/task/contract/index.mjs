// The always-run contract tests of `pnpm task finish`: the list, the vitest
// runner, and the gate step that reads one with the other.

export { contractGate } from "./gate.mjs";
export { CONTRACT_TESTS } from "./list.mjs";
export { runContractTests } from "./run-tests.mjs";
