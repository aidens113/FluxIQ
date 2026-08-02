import { mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProgramJsonStore } from "./storage";

const tempRoot = path.join(process.cwd(), ".tmp", "program-json-store-test");

describe("ProgramJsonStore", () => {
  beforeEach(async () => {
    await rm(tempRoot, { recursive: true, force: true });
    await mkdir(tempRoot, { recursive: true });
  });

  afterEach(async () => {
    await rm(tempRoot, { recursive: true, force: true });
  });

  it("uses unique temp files for concurrent writes to the same document", async () => {
    const filePath = path.join(tempRoot, "nested", "state.json");
    const store = new ProgramJsonStore<{ value: number }>(filePath, () => ({ value: 0 }));

    await Promise.all(Array.from({ length: 64 }, (_, index) => store.write({ value: index })));

    const finalValue = await store.read();
    const leftovers = await readdir(path.dirname(filePath));

    expect(finalValue.value).toBeGreaterThanOrEqual(0);
    expect(finalValue.value).toBeLessThan(64);
    expect(leftovers.filter((item) => item.endsWith(".tmp"))).toEqual([]);
  });
});
