import { mkdirSync, readdirSync } from "node:fs";
import path from "node:path";

/** One step's folder, numbered when the step starts. */
export type AutomationStudioLlmStepLogFolder = { step: number; name: string; path: string };

/** A step folder's name: four digits or more, a dash, then the kind. */
const STEP_FOLDER = /^(\d{4,})-/u;

/** The last number this process gave out per directory, so two steps of one process never share one. */
const lastGiven = new Map<string, number>();

/**
 * A new folder `NNNN-<kind>` in `directory`, numbered after the highest step
 * already there -- a Core restarted into the same directory carries on rather
 * than starting again at 0001.
 *
 * The folder is made without `recursive`, so a number another writer took
 * first fails with `EEXIST` and the next one is tried. Throws when the
 * directory cannot be made or read; the caller's hook is best-effort.
 */
export function automationStudioLlmStepLogOpenFolder(directory: string, kind: string): AutomationStudioLlmStepLogFolder {
  mkdirSync(directory, { recursive: true });
  let next = Math.max(highestStep(directory), lastGiven.get(directory) ?? 0) + 1;
  for (let tries = 0; tries < 10_000; tries += 1, next += 1) {
    const name = `${String(next).padStart(4, "0")}-${kind}`;
    const full = path.join(directory, name);
    try {
      mkdirSync(full);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") continue;
      throw error;
    }
    lastGiven.set(directory, next);
    return { step: next, name, path: full };
  }
  throw Object.assign(new Error("No free step number was found in the step log directory."), { code: "ESTEPLOGFULL" });
}

/**
 * Whether a throw from opening a folder is the disk refusing it -- a full disk,
 * a removed or read-only directory, no number left -- which every such failure
 * names with an errno-style code. That one failure means "no step", never a
 * failed call; anything else is a defect and is rethrown.
 */
export function automationStudioLlmStepLogFolderRefused(error: unknown): boolean {
  const code = typeof error === "object" && error !== null ? (error as { code?: unknown }).code : undefined;
  return typeof code === "string" && /^E[A-Z0-9_]+$/u.test(code);
}

function highestStep(directory: string): number {
  let highest = 0;
  for (const entry of readdirSync(directory)) {
    const number = STEP_FOLDER.exec(entry)?.[1];
    if (number !== undefined) highest = Math.max(highest, Number(number));
  }
  return highest;
}
