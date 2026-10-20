// Whether client gateway tracing is on (D11), read from the Core process's
// deployment configuration the way the candidate start hook reads its
// variables (`../candidate-start-hook/from-environment.ts`): unset is off, and
// a value that is neither a clear on nor a clear off refuses when the host
// starts, rather than silently tracing or silently not.

import { AUTOMATION_STUDIO_CLIENT_GATEWAY_TRACE_ENV as VARIABLE } from "./environment.ts";

type Environment = Readonly<Record<string, string | undefined>>;

const ON = new Set(["1", "true", "on"]);
const OFF = new Set(["", "0", "false", "off"]);

function processEnvironment(): Environment {
  return (globalThis as { process?: { env?: Environment } }).process?.env ?? {};
}

/**
 * True for `1`, `true` or `on`; false when unset or `0`, `false` or `off`
 * (case and surrounding space ignored). Throws, naming the variable, for
 * anything else.
 */
export function automationStudioClientGatewayTraceEnabled(env: Environment = processEnvironment()): boolean {
  const value = (env[VARIABLE] ?? "").trim().toLowerCase();
  if (ON.has(value)) return true;
  if (OFF.has(value)) return false;
  throw new Error(`${VARIABLE} must be 1, true or on to trace client gateway episodes, or unset, 0, false or off for none.`);
}
