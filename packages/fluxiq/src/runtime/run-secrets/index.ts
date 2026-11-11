// Barrel for a run's secrets (W3, t899): the run inputs a caller marked secret (a FluxNode's
// `format: "secret"`), carried beside the run rather than in its inputs, so nothing that records a
// run's inputs ever holds one. A step bound to one resolves it where it runs; every text that leaves
// the run -- a model request, a step file, a saved command attempt, a trace -- withholds it.
export { runWithAutomationStudioRunSecrets } from "./run-with.ts";
export { automationStudioRunSecrets } from "./read.ts";
export { automationStudioWithoutRunSecrets } from "./without-run-secrets.ts";
export { automationStudioWithRunSecretTexts } from "./with-run-secret-texts.ts";
