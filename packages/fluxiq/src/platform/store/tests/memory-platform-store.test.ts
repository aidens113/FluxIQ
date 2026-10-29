import { describe, expect, it } from "vitest";
import { MemoryPlatformStore } from "../memory/index.ts";
import { createPlatformStore } from "../create-platform-store.ts";
import { RepositoryPlatformStore } from "../repository/index.ts";
import { FakeRecordRepository } from "./fake-record-repository.ts";
import { runPlatformStoreSuite } from "./platform-store-suite.ts";

runPlatformStoreSuite("MemoryPlatformStore", () => new MemoryPlatformStore());

describe("createPlatformStore", () => {
  it("is memory without a repository and repository-backed with one", () => {
    expect(createPlatformStore({})).toBeInstanceOf(MemoryPlatformStore);
    expect(createPlatformStore()).toBeInstanceOf(MemoryPlatformStore);
    expect(createPlatformStore({ repository: new FakeRecordRepository() })).toBeInstanceOf(RepositoryPlatformStore);
  });
});
