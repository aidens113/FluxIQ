import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Marks the steps run only to get the page ready (t753). Before a part of a
 * Flow is built or tested from where the parts before it leave the site, the
 * project build runs those parts once to put the page there
 * (`../../service/project-build/entry-preparation.ts`). Its steps reported
 * "Running step N of M" under the build's unit of work, which a status reads
 * as the build testing its Flow: the line said "Testing your Flow", and its
 * count jumped from "Step 1 of 3" to "Step 2 of 5" as the run went into a
 * part's own steps. Run under this mark, a step says "Getting the page ready"
 * instead (`./started.ts`), which a status reads as neither a test nor a
 * repair (`ui/activity-status/steady/page-preparation.ts`).
 */
const preparing = new AsyncLocalStorage<true>();

/** Runs `fn` with every step it starts, however deep, said as getting the page ready. */
export function runAutomationStudioActivityPreparation<T>(fn: () => T): T {
  return preparing.run(true, fn);
}

/** Whether the current async context runs steps only to get the page ready. */
export function automationStudioActivityPreparing(): boolean {
  return preparing.getStore() === true;
}
