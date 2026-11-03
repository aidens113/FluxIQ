import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Marks the steps run to check a build's test against the recorded run (trace
 * plan P6, t769 b13). Before a test touches the site, the test gates may run
 * the Flow against the recording of the build's last live test, through Core's
 * real executor (`../../service/offline-trial/`), inside the step log's
 * offline-trial wrapper (`../../llm/step-log/offline-trial-step.ts`). Its steps
 * said "Running step N of M" under the build's unit of work, which a status
 * reads as the build testing its Flow on the site. Run under this mark, a step
 * says "Checking against the recorded run" instead (`./started.ts`), which a
 * status heads as checking the Flow against the recorded run
 * (`ui/activity-status/steady/recorded-check.ts`).
 */
const checking = new AsyncLocalStorage<true>();

export const automationStudioActivityRecordedCheck = Object.freeze({
  /** Runs `fn` with every step it starts, however deep, said as checked against the recorded run. */
  run<T>(fn: () => T): T {
    return checking.run(true, fn);
  },
  /** Whether the current async context checks against the recorded run. */
  active(): boolean {
    return checking.getStore() === true;
  }
});
