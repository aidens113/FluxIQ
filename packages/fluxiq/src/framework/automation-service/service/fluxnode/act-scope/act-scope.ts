// Which execution a FluxNode run's lasting acts belong to (t909): the attempt's `actScope`
// (`../../answer-first/attempt/opening.ts`). The task key stays the name and spec hash (`../caller-key.ts`),
// so every run finds and replays the one saved Flow; the act scope says whose acts a run must not repeat.
//
// - **A run is its own execution.** Its scope is its own run id, so it starts with an empty act record and
//   what it is asked to do lands, whatever an earlier run with these or other inputs landed.
// - **An idempotency key names one execution.** A run started by a key and a request is scoped by both, so
//   a later run with the same key and the same request, after the run registry has forgotten it (a
//   restart), continues that run's record: what may have landed is not pressed again. The key and the
//   request are kept only as a digest, since a request holds the inputs.
// - **A resume continues its run**, and keeps the first run's scope with what it carries (`../fluxnode-run.ts`).

import { createHash } from "node:crypto";
import { canonicalJson } from "@fluxiq/contracts/fluxnode";
import type { JsonValue } from "../../../../../core/index.ts";

/** The scope of a run launched now: by its idempotency key and request where it has one, else its own run id. */
export function fluxNodeActScope(input: { runId: string; key?: { key: string; request: unknown } | undefined }): string {
  if (input.key === undefined) return `fluxnode.run.${input.runId}`;
  const named = canonicalJson(JSON.parse(JSON.stringify({ key: input.key.key, request: input.key.request ?? null })) as JsonValue);
  return `fluxnode.key.${createHash("sha256").update(named).digest("hex")}`;
}
