import { PLATFORM_REGISTRY_KEY } from "./platform-registry-key.ts";

export function resetPlatformRegistryForTests(): void {
  delete (globalThis as Record<symbol, unknown>)[PLATFORM_REGISTRY_KEY];
}
