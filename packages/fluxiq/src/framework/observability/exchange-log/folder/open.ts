import type { AutomationStudioLlmStepLogFolder } from "./record.ts";
import { mkdirSync, readdirSync } from "node:fs";
import path from "node:path";

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

function highestStep(directory: string): number {
  let highest = 0;
  for (const entry of readdirSync(directory)) {
    const number = STEP_FOLDER.exec(entry)?.[1];
    if (number !== undefined) highest = Math.max(highest, Number(number));
  }
  return highest;
}
