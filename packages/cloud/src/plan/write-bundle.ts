import { copyFile, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CloudPlan } from "./types.ts";

/**
 * Writes the plan's bundle into `directory` (the plan's own bundleDir for
 * `up`, any folder for `render`). A folder holding an earlier bundle (it has
 * deployment.json) is replaced; any other non-empty folder is refused, so a
 * mistyped --out never deletes someone's files. The deploy/ files are copied
 * unchanged from the Core checkout; a missing one is an error naming it.
 * Answers the written paths, bundle-relative.
 */
export async function writeBundle(plan: CloudPlan, directory: string): Promise<string[]> {
  for (const file of Object.values(plan.files)) {
    if (!("copyFrom" in file)) continue;
    try { await readFile(file.copyFrom); }
    catch { throw new Error(`${file.copyFrom} is missing: source.root must be a FluxIQ Core checkout with deploy/.`); }
  }
  const existing: string[] = await readdir(directory).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return [] as string[];
    throw error;
  });
  if (existing.length > 0) {
    if (!existing.includes("deployment.json")) throw new Error(`${directory} is not empty and holds no earlier bundle; choose an empty folder.`);
    await rm(directory, { recursive: true, force: true });
  }
  for (const [relative, file] of Object.entries(plan.files)) {
    const target = path.join(directory, relative);
    await mkdir(path.dirname(target), { recursive: true });
    if ("copyFrom" in file) await copyFile(file.copyFrom, target);
    else await writeFile(target, file.content, "utf8");
  }
  return Object.keys(plan.files);
}
