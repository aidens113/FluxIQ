// A tasks memory held in a variable, for a test that closes the screen and mounts it again.

import type { TasksMemory } from "../../screens/tasks/index.ts";

export type FakeTasksMemory = TasksMemory & { readonly open: { projectId: string; taskId: string } | undefined };

/** An empty memory; `open` is what it holds now. */
export function createFakeTasksMemory(initial?: { projectId: string; taskId: string }): FakeTasksMemory {
  let held = initial;
  return {
    get open() {
      return held;
    },
    read: async () => held,
    write: async (open) => {
      held = open;
    }
  };
}
