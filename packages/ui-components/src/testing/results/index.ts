// A results port with no Core behind it, and a task's outcome in each state, for
// building the answer turn. `fakeNoLoopsCaught` is internal and not re-exported.
export {
  createFakeChatResultsPort,
  type FakeChatResultsCall,
  type FakeChatResultsDownload,
  type FakeChatResultsOptions,
  type FakeChatResultsPort,
  type FakeChatResultsThread
} from "./port.ts";
export { fakeTaskOutcomes } from "./outcomes.ts";
