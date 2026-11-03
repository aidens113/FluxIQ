// The storage root that owns a directory is resolved once and used again only
// while its config.json is unchanged (t435).

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { programStateRoot } from "../state-root.ts";

async function withRoot(operation: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-state-root-"));
  try {
    await operation(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

describe("programStateRoot", () => {
  it("finds the nearest config.json above a directory, with the config read", async () => withRoot(async (root) => {
    const deep = path.join(root, "artifacts", "automation-studio", "projects", "one");
    await mkdir(deep, { recursive: true });
    await writeFile(path.join(root, "config.json"), JSON.stringify({ layoutVersion: 2 }));

    expect(programStateRoot(deep)).toEqual({ dir: root, config: { layoutVersion: 2 } });
    expect(programStateRoot(deep)).toEqual({ dir: root, config: { layoutVersion: 2 } });
  }));

  it("reads the config again once it was rewritten, and walks again once it is gone", async () => withRoot(async (root) => {
    const deep = path.join(root, "programs", "docs");
    await mkdir(deep, { recursive: true });
    await writeFile(path.join(root, "config.json"), JSON.stringify({ layoutVersion: 2 }));
    expect(programStateRoot(deep)?.config).toEqual({ layoutVersion: 2 });

    await writeFile(path.join(root, "config.json"), JSON.stringify({ layoutVersion: 1, note: "rewritten to a different size" }));
    expect(programStateRoot(deep)?.config).toEqual({ layoutVersion: 1, note: "rewritten to a different size" });

    await rm(path.join(root, "config.json"));
    const found = programStateRoot(deep);
    // Nothing at or above the temporary root but whatever the machine has further up.
    expect(found?.dir === root).toBe(false);
  }));

  it("throws for a config that cannot be parsed, and does not keep it", async () => withRoot(async (root) => {
    await writeFile(path.join(root, "config.json"), "{ not json");
    expect(() => programStateRoot(root)).toThrow();
    await writeFile(path.join(root, "config.json"), JSON.stringify({ layoutVersion: 2 }));
    expect(programStateRoot(root)).toEqual({ dir: root, config: { layoutVersion: 2 } });
  }));
});
