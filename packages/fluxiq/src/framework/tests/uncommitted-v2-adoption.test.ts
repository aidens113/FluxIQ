import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SQLiteRepository, createRecord } from "../../programs/database-manager/storage/sqlite-repository.ts";
import { adoptUncommittedFluxIQStorage, FluxIQ, inspectFluxIQStorage, migrateFluxIQStorage } from "../index.ts";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("uncommitted layout-v2 adoption", () => {
  it("writes only the missing marker and preserves the existing database byte-for-byte", async () => {
    const fluxiqRoot = await validUncommittedRoot();
    await mkdir(path.join(fluxiqRoot, "security"));
    const databasePath = path.join(fluxiqRoot, "global.sqlite");
    const before = await fileIdentity(databasePath);

    expect(inspectFluxIQStorage({ fluxiqRoot })).toMatchObject({
      layout: "uncommitted_v2",
      layoutVersion: null,
      migrationRequired: false
    });
    const result = await adoptUncommittedFluxIQStorage({ fluxiqRoot });

    expect(result).toMatchObject({ databaseBytes: before.bytes, databaseSha256: before.sha256, retainedEntries: ["global.sqlite", "security"] });
    expect(await fileIdentity(databasePath)).toEqual(before);
    expect((await readdir(fluxiqRoot)).sort()).toEqual(["config.json", "global.sqlite", "security"]);
    expect(inspectFluxIQStorage({ fluxiqRoot }).layout).toBe("v2");
  });

  it.each([
    ["legacy root", async (root: string) => mkdir(path.join(root, "data"))],
    ["unknown entry", async (root: string) => writeFile(path.join(root, "unknown.txt"), "unknown")],
    ["ambiguous domain root", async (root: string) => mkdir(path.join(root, "domains"))],
    ["migration journal", async (root: string) => {
      const directory = path.join(root, ".migration", "v2");
      await mkdir(directory, { recursive: true });
      await writeFile(path.join(directory, "journal.json"), "{}", "utf8");
    }]
  ])("rejects a %s without writing", async (_label, arrange) => {
    const fluxiqRoot = await validUncommittedRoot();
    await arrange(fluxiqRoot);
    const before = await treeIdentity(fluxiqRoot);

    await expect(adoptUncommittedFluxIQStorage({ fluxiqRoot })).rejects.toThrow();

    expect(await treeIdentity(fluxiqRoot)).toEqual(before);
    await expect(stat(path.join(fluxiqRoot, "config.json"))).rejects.toThrow();
  });

  it("rejects a malformed database without writing", async () => {
    const fluxiqRoot = await temporaryFluxIQRoot();
    await writeFile(path.join(fluxiqRoot, "global.sqlite"), "not a sqlite database", "utf8");
    const before = await treeIdentity(fluxiqRoot);

    await expect(adoptUncommittedFluxIQStorage({ fluxiqRoot })).rejects.toThrow("Cannot adopt malformed global.sqlite");

    expect(await treeIdentity(fluxiqRoot)).toEqual(before);
  });

  it("rejects a well-formed foreign database without writing", async () => {
    const fluxiqRoot = await temporaryFluxIQRoot();
    const repository = new SQLiteRepository({ rootDir: fluxiqRoot, kind: "foreign.records", layoutVersion: 2 });
    await repository.put(createRecord({ id: "foreign", kind: "foreign.records", data: {} }));
    const before = await treeIdentity(fluxiqRoot);

    await expect(adoptUncommittedFluxIQStorage({ fluxiqRoot })).rejects.toThrow("recognized FluxIQ global table");

    expect(await treeIdentity(fluxiqRoot)).toEqual(before);
  });

  it("rejects external overrides and the v1 migration path without writing", async () => {
    const fluxiqRoot = await validUncommittedRoot();
    const before = await treeIdentity(fluxiqRoot);

    await expect(adoptUncommittedFluxIQStorage({ fluxiqRoot, externalOverrides: ["FLUXIQ_DATA_DIR"] })).rejects.toThrow("external storage overrides");
    await expect(migrateFluxIQStorage({ fluxiqRoot })).rejects.toThrow("adoptUncommittedFluxIQStorage");
    const fluxiq = FluxIQ.create({ rootDir: path.dirname(fluxiqRoot), fluxiqDir: path.basename(fluxiqRoot), loadEnv: false });
    await expect(fluxiq.setup()).rejects.toThrow("explicit adoptUncommittedFluxIQStorage");

    expect(await treeIdentity(fluxiqRoot)).toEqual(before);
  });
});

async function validUncommittedRoot(): Promise<string> {
  const fluxiqRoot = await temporaryFluxIQRoot();
  const repository = new SQLiteRepository({ rootDir: fluxiqRoot, kind: "identity.users", layoutVersion: 2 });
  await repository.put(createRecord({ id: "user:admin", kind: "identity.users", data: { username: "admin" } }));
  return fluxiqRoot;
}

async function temporaryFluxIQRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-uncommitted-v2-"));
  roots.push(root);
  return root;
}

async function fileIdentity(filePath: string): Promise<{ bytes: number; sha256: string }> {
  const contents = await readFile(filePath);
  return { bytes: contents.byteLength, sha256: createHash("sha256").update(contents).digest("hex") };
}

async function treeIdentity(root: string): Promise<string[]> {
  const result: string[] = [];
  async function visit(directory: string): Promise<void> {
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort((left, right) => left.name.localeCompare(right.name))) {
      const child = path.join(directory, entry.name);
      const relative = path.relative(root, child).replaceAll("\\", "/");
      if (entry.isDirectory()) {
        result.push(`directory:${relative}`);
        await visit(child);
      } else {
        const identity = await fileIdentity(child);
        result.push(`file:${relative}:${identity.bytes}:${identity.sha256}`);
      }
    }
  }
  await visit(root);
  return result;
}
