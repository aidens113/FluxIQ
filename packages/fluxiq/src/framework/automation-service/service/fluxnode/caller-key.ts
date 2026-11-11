// The key a FluxNode run names its task by (fluxnode-plan N1, N8; `../answer-first/task-key/`): the name and
// spec hash, never the inputs, so other inputs are the same task and find its saved Flow.
//
// - **`explore`** runs under a key of its own, so it starts fresh and the learned Flow is kept as it was.
// - **`pinned`** is where a pinned FluxNode's runs keep what they change (`./pin/`): seeded with the pinned
//   Flow before each run, so a replay runs exactly that, and whatever a repair or an exploration saves lands
//   here and never on the learned Flow, which stays the pinned one.

export function fluxNodeCallerKey(input: { name: string; specHash: string; explore?: string | undefined; pinned?: boolean | undefined }): string {
  const key = `fluxnode:${input.name}:${input.specHash}`;
  if (input.explore !== undefined) return `${key}:explore:${input.explore}`;
  return input.pinned === true ? `${key}:pinned` : key;
}
