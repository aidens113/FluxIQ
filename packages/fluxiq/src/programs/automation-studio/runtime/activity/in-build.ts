import { automationStudioActivityStorage } from "./storage.ts";

/**
 * True while the current async context is a build's unit of work
 * (`./scope.ts`), so a sentence shared by builds and runs can say what it
 * means in the one it is said in: a result check that did not settle fails
 * no run, but no build can finish on it (`../result-verification/check-activity.ts`).
 */
export function automationStudioActivityInBuild(): boolean {
  return automationStudioActivityStorage.getStore()?.scope.kind === "build";
}
