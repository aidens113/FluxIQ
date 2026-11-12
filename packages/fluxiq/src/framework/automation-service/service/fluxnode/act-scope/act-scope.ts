// Which execution a FluxNode run's lasting acts belong to (t909): the attempt's `actScope`
// (`../../answer-first/attempt/opening.ts`). The task key stays the name and spec hash (`../caller-key.ts`),
// so every run finds and replays the one saved Flow; the act scope says whose acts a run must not repeat.
//
// - **A run is its own execution.** Its scope is its own run id, so it starts with an empty act record and
//   what it is asked to do lands, whatever an earlier run with these or other inputs landed.
// - **An idempotency key names one execution.** Its durable owner/project registry allocates an opaque
//   execution scope once (`./idempotency-keys.ts`); request comparison uses only safe binding identity.
//   No deterministic verifier of a secret input is stored.
// - **A resume continues its run**, and keeps the first run's scope with what it carries (`../fluxnode-run.ts`).

/** The scope of a run launched now: its allocated keyed scope, otherwise its own run id. */
export function fluxNodeActScope(input: { runId: string; keyScope?: string | undefined }): string {
  return input.keyScope ?? `fluxnode.run.${input.runId}`;
}
