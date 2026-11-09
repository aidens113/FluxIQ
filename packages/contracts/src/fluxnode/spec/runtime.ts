// The runtime a FluxNode's Flow runs on (plan, N10): Core sends its steps to a
// connected host that provides that runtime. The list is open, so a new kind of host
// needs no contract change; these four are the ones Core knows today.

import { z } from "zod";

/** The runtimes Core knows: a site, an Android device, a Linux machine, a Windows machine. */
export const FLUXNODE_KNOWN_RUNTIMES = Object.freeze(["web", "android", "linux", "windows"] as const);

export type FluxNodeKnownRuntime = (typeof FLUXNODE_KNOWN_RUNTIMES)[number];

/** A known runtime, or any other id a host declares. */
export type FluxNodeRuntime = FluxNodeKnownRuntime | (string & {});

/** A runtime id: 1 to 32 of lowercase a-z, 0-9 and "-", starting with a letter, so it is also a Flow path segment. */
export const fluxNodeRuntimeSchema = z
  .string()
  .regex(/^[a-z](?:[a-z0-9-]{0,30}[a-z0-9])?$/u, 'A runtime id is 1 to 32 of lowercase a-z, 0-9 and "-", starting with a letter, such as "web" or "android".')
  .transform((runtime): FluxNodeRuntime => runtime);
