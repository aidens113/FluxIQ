import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { ProgramJsonStore } from "../../../../_shared/storage.ts";
import { CanonicalAuthorityProjectExistence } from "../project-existence.ts";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function fixture() { const root = await mkdtemp(path.join(os.tmpdir(), "canonical-existence-")); roots.push(root); return root; }
it("rejects absent catalogue without creating authority/project storage", async () => {
  const root = await fixture(); await expect(new CanonicalAuthorityProjectExistence(path.join(root, "projects")).verify("original-project")).rejects.toThrow("missing"); expect(await readdir(root)).toEqual([]);
});
it("requires both actual index and exact original manifest", async () => {
  const root = await fixture(), projectRoot = path.join(root, "projects"), reader = new CanonicalAuthorityProjectExistence(projectRoot);
  await new ProgramJsonStore(path.join(projectRoot, "index.json"), () => ({})).write({ projects: [{ id: "original-project" }] });
  await expect(reader.verify("original-project")).rejects.toThrow("missing");
  const manifest = new ProgramJsonStore(path.join(projectRoot, "original-project", "manifest.json"), () => ({}));
  await manifest.write({ id: "foreign" }); await expect(reader.verify("original-project")).rejects.toThrow("missing");
  await manifest.write({ id: "original-project" }); expect(await reader.verify("original-project")).toMatch(/^sha256:/);
});
it("refuses corrupt layout even if plausible original files exist", async () => {
  const root = await fixture(); await mkdir(path.join(root, "projects")); await writeFile(path.join(root, "config.json"), "{broken");
  await expect(new CanonicalAuthorityProjectExistence(path.join(root, "projects")).verify("original-project")).rejects.toThrow();
});
