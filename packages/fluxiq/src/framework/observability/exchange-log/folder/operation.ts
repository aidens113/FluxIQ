import type { AutomationStudioLlmStepLogFolder } from "./record.ts";
import path from "node:path";
import { NativeExchangeLogInvocation } from "../native/index.ts";

/** A step folder's name: four digits or more, a dash, then the kind. */
const STEP_FOLDER = /^(\d{4,})-/u;

/** The last number this process gave out per directory, so two steps of one process never share one. */
const lastGiven = new Map<string, number>();

/** Same exclusive numbering algorithm for legacy and current native invocations. */
export function openNativeExchangeLogFolder(directory: string, kind: string, invocation?: NativeExchangeLogInvocation): AutomationStudioLlmStepLogFolder {
  if (invocation !== undefined) NativeExchangeLogInvocation.assert(invocation);
  NativeExchangeLogInvocation.mkdir(invocation, directory, { recursive: true });
  let next = Math.max(highestStep(directory, invocation), lastGiven.get(directory) ?? 0) + 1;
  for (let tries = 0; tries < 10_000; tries += 1, next += 1) {
    const name = `${String(next).padStart(4, "0")}-${kind}`;
    const full = path.join(directory, name);
    try {
      NativeExchangeLogInvocation.mkdir(invocation, full);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") continue;
      throw error;
    }
    lastGiven.set(directory, next);
    return { step: next, name, path: full };
  }
  const error = Object.assign(new Error("No free step number was found in the step log directory."), { code: "ESTEPLOGFULL" });
  NativeExchangeLogInvocation.failed(invocation, error);
  throw error;
}

function highestStep(directory: string, invocation: NativeExchangeLogInvocation | undefined): number {
  let highest = 0;
  for (const entry of NativeExchangeLogInvocation.readdir(invocation, directory)) {
    const number = STEP_FOLDER.exec(entry)?.[1];
    if (number !== undefined) highest = Math.max(highest, Number(number));
  }
  return highest;
}
