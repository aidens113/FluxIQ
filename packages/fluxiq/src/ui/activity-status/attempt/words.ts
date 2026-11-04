// The words an answer-first attempt's activity says (t861, t869). An attempt does the task, so its
// activity never says a Flow is being built or is ready. `runtime/automation-activity/build.ts`
// says them as the labels of the rows it emits, and the unit situation reads the opening one, so the
// headline of the unit follows the attempt from its first row to its last.

/** What an attempt's activity is called while it works and as it ends, in a person's words. */
export const ACTIVITY_ATTEMPT_WORDS = Object.freeze({
  working: "Working on your task",
  finished: "Finished",
  budget: "Reached this task's budget",
  stopped: "Stopped",
  waiting: "Waiting for you",
  setup: "Before I can start",
  /** An attempt that ended on an error of its own, which no answer explains. */
  unfinished: "Couldn't finish your task"
});
