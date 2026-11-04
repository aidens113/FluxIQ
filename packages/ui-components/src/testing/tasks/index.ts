// A tasks port and a memory with no Core behind them, and a person's tasks in each state,
// for building and testing the tasks screen.
export { fakeTasks, type FakeTask } from "./fixtures.ts";
export { createFakeTasksMemory, type FakeTasksMemory } from "./memory.ts";
export { createFakeTasksPort, type FakeTasksCall, type FakeTasksOptions, type FakeTasksPort } from "./port.ts";
