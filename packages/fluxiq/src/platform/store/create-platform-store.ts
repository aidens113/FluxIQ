import { MemoryPlatformStore } from "./memory/index.ts";
import { RepositoryPlatformStore } from "./repository/index.ts";
import type { PlatformRecordRepository } from "./repository/index.ts";
import type { PlatformStore } from "./types.ts";

/** A repository-backed platform store when a repository is given, otherwise an in-memory one. */
export function createPlatformStore(options: { repository?: PlatformRecordRepository } = {}): PlatformStore {
  return options.repository === undefined ? new MemoryPlatformStore() : new RepositoryPlatformStore(options.repository);
}
