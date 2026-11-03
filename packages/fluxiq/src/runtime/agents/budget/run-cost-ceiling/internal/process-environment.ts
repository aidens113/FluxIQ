import type { Environment } from "./environment.ts";

export function processEnvironment(): Environment {
  return (globalThis as { process?: { env?: Environment } }).process?.env ?? {};
}
