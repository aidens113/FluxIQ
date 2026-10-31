import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  FLUXIQ_LAYOUT_V3_VERSION,
  fluxiqLayoutV3Paths,
  fluxiqWorkspaceRootDir,
  initializeFluxIQLayoutV3,
  inspectFluxIQLayoutV3,
  removeFluxIQWorkspaceRoot
} from "../index.ts";

let base: string;
beforeEach(async () => {
  base = await mkdtemp(path.join(os.tmpdir(), "fluxiq-layout-v3-"));
});
afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

const exists = (target: string) => stat(target).then(() => true, () => false);

describe("layout v3", () => {
  it("shapes the paths", () => {
    const paths = fluxiqLayoutV3Paths(path.join(base, "host"));
    expect(paths.dataRoot).toBe(path.join(base, "host"));
    expect(paths.platformFluxiqDir).toBe(path.join(base, "host", ".fluxiq"));
    expect(paths.workspacesDir).toBe(path.join(base, "host", "workspaces"));
    expect(paths.markerPath).toBe(path.join(base, "host", "workspaces", "layout.json"));
    expect(fluxiqLayoutV3Paths(path.join(base, "host"), { workspacesDir: path.join(base, "vol") }).workspacesDir).toBe(path.join(base, "vol"));
  });

  it("gives a direct child for valid ids", () => {
    const paths = fluxiqLayoutV3Paths(base);
    for (const id of ["workspace-main", "3f2b8c1e-5d4a-4b7e-9a10-0c2d4e6f8a1b", "a", "0"]) {
      expect(fluxiqWorkspaceRootDir(paths, id)).toBe(path.join(paths.workspacesDir, id));
    }
  });

  it("refuses every invalid id, traversal included", () => {
    const paths = fluxiqLayoutV3Paths(base);
    const bad = ["", ".", "..", "../x", "a/b", "a\\b", "C:", "C:\\x", "/abs", "a\u0000b", "Workspace", "-lead", "a b", "a.b", "x".repeat(64), "..\\..\\evil", "../../etc/passwd"];
    for (const id of bad) expect(() => fluxiqWorkspaceRootDir(paths, id), JSON.stringify(id)).toThrow(/^storage\.workspace_id_invalid:/);
    expect(() => fluxiqWorkspaceRootDir(paths, undefined as unknown as string)).toThrow(/^storage\.workspace_id_invalid:/);
  });

  it("initializes idempotently and writes the marker", async () => {
    const paths = fluxiqLayoutV3Paths(path.join(base, "host"));
    expect(inspectFluxIQLayoutV3(paths)).toEqual({ layout: "fresh" });
    await initializeFluxIQLayoutV3(paths);
    const first = JSON.parse(await readFile(paths.markerPath, "utf8"));
    expect(first).toMatchObject({ layoutVersion: FLUXIQ_LAYOUT_V3_VERSION, createdBy: "fluxiq" });
    expect(inspectFluxIQLayoutV3(paths)).toEqual({ layout: "v3" });
    await initializeFluxIQLayoutV3(paths);
    expect(JSON.parse(await readFile(paths.markerPath, "utf8"))).toEqual(first);
  });

  it("reports an unreadable or wrong-version marker as invalid and refuses to initialize", async () => {
    const paths = fluxiqLayoutV3Paths(base);
    await mkdir(paths.workspacesDir, { recursive: true });
    await writeFile(paths.markerPath, "{nope", "utf8");
    expect(inspectFluxIQLayoutV3(paths).layout).toBe("invalid");
    await expect(initializeFluxIQLayoutV3(paths)).rejects.toThrow(/^storage\.layout_v3_invalid:/);
    await writeFile(paths.markerPath, JSON.stringify({ layoutVersion: 2 }), "utf8");
    expect(inspectFluxIQLayoutV3(paths).layout).toBe("invalid");
    await expect(initializeFluxIQLayoutV3(paths)).rejects.toThrow(/storage\.layout_v3_invalid/);
  });

  it("refuses a workspaces directory inside a storage root", async () => {
    const root = path.join(base, ".fluxiq");
    await mkdir(root, { recursive: true });
    await writeFile(path.join(root, "config.json"), JSON.stringify({ version: 2, layoutVersion: 2 }), "utf8");
    const paths = fluxiqLayoutV3Paths(base, { workspacesDir: path.join(root, "workspaces") });
    expect(inspectFluxIQLayoutV3(paths).layout).toBe("invalid");
    await expect(initializeFluxIQLayoutV3(paths)).rejects.toThrow(/inside the storage root/);
    expect(await exists(path.join(root, "workspaces"))).toBe(false);
  });

  it("allows the default layout beside the platform .fluxiq", async () => {
    await mkdir(path.join(base, ".fluxiq"), { recursive: true });
    await writeFile(path.join(base, ".fluxiq", "config.json"), JSON.stringify({ version: 2, layoutVersion: 2 }), "utf8");
    const paths = await initializeFluxIQLayoutV3(fluxiqLayoutV3Paths(base));
    expect(inspectFluxIQLayoutV3(paths)).toEqual({ layout: "v3" });
  });

  it("removes one workspace root and nothing else", async () => {
    const paths = await initializeFluxIQLayoutV3(fluxiqLayoutV3Paths(base));
    const keep = fluxiqWorkspaceRootDir(paths, "keep");
    const drop = fluxiqWorkspaceRootDir(paths, "drop");
    for (const dir of [keep, drop]) {
      await mkdir(path.join(dir, ".fluxiq"), { recursive: true });
      await writeFile(path.join(dir, ".fluxiq", "config.json"), "{}", "utf8");
    }
    expect(await removeFluxIQWorkspaceRoot(paths, "drop")).toBe(true);
    expect(await exists(drop)).toBe(false);
    expect(await exists(keep)).toBe(true);
    expect(await exists(paths.markerPath)).toBe(true);
    expect(await removeFluxIQWorkspaceRoot(paths, "drop")).toBe(false);
  });

  it("refuses to remove outsiders", async () => {
    const paths = await initializeFluxIQLayoutV3(fluxiqLayoutV3Paths(base));
    const outside = path.join(base, "outside");
    await mkdir(outside, { recursive: true });
    for (const id of ["..", ".", "../outside", "a/b", "", "Upper"]) {
      await expect(removeFluxIQWorkspaceRoot(paths, id), JSON.stringify(id)).rejects.toThrow(/^storage\.workspace_id_invalid:/);
    }
    expect(await exists(outside)).toBe(true);
    expect(await exists(paths.markerPath)).toBe(true);
  });
});
