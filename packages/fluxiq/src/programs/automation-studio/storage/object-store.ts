import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { JsonObject } from "../../../core/index.ts";
import { safeSegment } from "../../_shared/storage.ts";

export const AUTOMATION_STUDIO_OBJECT_THRESHOLD_BYTES = 256 * 1024;

export type AutomationStudioObjectReference = {
  $fluxiqObject: {
    sha256: string;
    size: number;
    mediaType: "application/json";
    relativePath: string;
  };
};

export class AutomationStudioObjectStore {
  constructor(readonly rootDir: string) {}

  async putJson(projectId: string, value: JsonObject): Promise<AutomationStudioObjectReference> {
    const content = Buffer.from(JSON.stringify(value), "utf8");
    const sha256 = createHash("sha256").update(content).digest("hex");
    const relativePath = path.join("projects", safeSegment(projectId), "objects", `${sha256}.json`);
    const target = path.join(this.rootDir, relativePath);
    try {
      const existing = await stat(target);
      if (existing.size !== content.length) throw new Error(`Object hash collision at ${target}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      await mkdir(path.dirname(target), { recursive: true });
      const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
      await writeFile(temporary, content);
      try {
        await rename(temporary, target);
      } catch (renameError) {
        await rm(temporary, { force: true });
        const existing = await readFile(target).catch(() => null);
        if (!existing || createHash("sha256").update(existing).digest("hex") !== sha256) throw renameError;
      }
    }
    return { $fluxiqObject: { sha256, size: content.length, mediaType: "application/json", relativePath: relativePath.replaceAll("\\", "/") } };
  }

  async readJson(reference: AutomationStudioObjectReference): Promise<JsonObject> {
    const target = path.resolve(this.rootDir, reference.$fluxiqObject.relativePath);
    const root = `${path.resolve(this.rootDir)}${path.sep}`;
    if (!target.startsWith(root)) throw new Error("Automation Studio object reference escapes its storage root.");
    const content = await readFile(target);
    const digest = createHash("sha256").update(content).digest("hex");
    if (digest !== reference.$fluxiqObject.sha256) throw new Error(`Automation Studio object digest mismatch: ${reference.$fluxiqObject.relativePath}`);
    return JSON.parse(content.toString("utf8")) as JsonObject;
  }
}

export function isAutomationStudioObjectReference(value: JsonObject): value is JsonObject & AutomationStudioObjectReference {
  const reference = value.$fluxiqObject;
  return Boolean(reference && typeof reference === "object" && !Array.isArray(reference) && typeof (reference as JsonObject).sha256 === "string" && typeof (reference as JsonObject).relativePath === "string");
}
