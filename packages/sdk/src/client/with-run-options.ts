import type { FluxNodeRunRequestInput } from "@fluxiq/contracts/fluxnode";
import type { RunOptions } from "./run-types.ts";
import { splitRunOverrides } from "./split-run-overrides.ts";

/** `request` with the options a program gave: option and FluxNode overrides, correlation id and idempotency key. */
export function withRunOptions(request: FluxNodeRunRequestInput, options: RunOptions): FluxNodeRunRequestInput {
  const out = { ...request };
  if (options.overrides !== undefined) Object.assign(out, splitRunOverrides(options.overrides));
  if (options.correlationId !== undefined) out.correlationId = options.correlationId;
  if (options.idempotencyKey !== undefined) out.idempotencyKey = options.idempotencyKey;
  return out;
}
