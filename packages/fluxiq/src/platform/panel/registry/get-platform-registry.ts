import type { PlatformRegistry } from "../types.ts";
import { createPlatformRegistry } from "./create-platform-registry.ts";
import { PLATFORM_REGISTRY_KEY } from "./platform-registry-key.ts";

/** The process-wide registry, created on first use. */
export function getPlatformRegistry(): PlatformRegistry {
  const store = globalThis as Record<symbol, PlatformRegistry | undefined>;
  return (store[PLATFORM_REGISTRY_KEY] ??= createPlatformRegistry());
}
