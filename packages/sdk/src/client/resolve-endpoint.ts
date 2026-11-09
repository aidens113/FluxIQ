// Which engine to talk to: an explicit address, `FLUXIQ_ENDPOINT`, the profile's or
// project's, then the local engine. "local" means the local engine's default address.

import type { ResolvedCredential } from "../keys/index.ts";
import { readProjectConfig } from "../keys/index.ts";
import { SdkError } from "../errors/index.ts";

/** Where `fluxiq dev` serves on this machine. */
export const DEFAULT_ENGINE_URL = "http://127.0.0.1:4780";

/** The engine's base address, with no trailing path. */
export function resolveEndpoint(explicit: string | undefined, credential: ResolvedCredential | undefined, env: NodeJS.ProcessEnv, cwd: string): string {
  const chosen = explicit ?? (env.FLUXIQ_ENDPOINT !== undefined && env.FLUXIQ_ENDPOINT !== "" ? env.FLUXIQ_ENDPOINT : undefined) ?? credential?.endpoint ?? readProjectConfig(cwd)?.endpoint ?? "local";
  const address = chosen === "local" ? DEFAULT_ENGINE_URL : chosen;
  if (!URL.canParse(address)) throw new SdkError("connection", `"${address}" is not an engine address; use something like ${DEFAULT_ENGINE_URL}.`);
  return new URL(address).origin;
}
