import { describe, expect, expectTypeOf, it } from "vitest";
// The contract's own types, reached by path because this package does not depend on
// `@fluxiq/contracts` (`../results.ts` says why). Only types: nothing of it loads.
import type {
  AutomationStudioAttemptAct,
  AutomationStudioSavedState,
  AutomationStudioTaskAttempt,
  AutomationStudioTaskResult,
  AutomationStudioTaskResultRows
} from "../../../../../contracts/src/task-attempts/index.ts";
import type { ChatAttemptAct, ChatJsonObject, ChatResultsPort, ChatSavedState, ChatTaskAttempt, ChatTaskResult, ChatTaskResultRows, ChatTransport } from "../index.ts";

// The assertions on types are enforced by `tsc --noEmit` (`pnpm --filter @fluxiq/ui-components check`),
// which includes this file; vitest runs them as no-ops. They are what keeps the restated records
// from parting from the contract, in either direction.
describe("the results port's records", () => {
  it("are the contract's records, word for word", () => {
    expectTypeOf<ChatAttemptAct>().toEqualTypeOf<AutomationStudioAttemptAct>();
    expectTypeOf<ChatTaskAttempt>().toEqualTypeOf<AutomationStudioTaskAttempt>();
    expectTypeOf<ChatSavedState>().toEqualTypeOf<AutomationStudioSavedState>();
    expectTypeOf<Omit<ChatTaskResult, "rows" | "acts">>().toEqualTypeOf<Omit<AutomationStudioTaskResult, "rows" | "acts">>();
    expectTypeOf<Omit<ChatTaskResultRows, "previewRows">>().toEqualTypeOf<Omit<AutomationStudioTaskResultRows, "previewRows">>();
  });

  it("hold a row as the contract does, either way round", () => {
    expectTypeOf<ChatJsonObject>().toMatchTypeOf<AutomationStudioTaskResultRows["previewRows"][number]>();
    expectTypeOf<AutomationStudioTaskResultRows["previewRows"][number]>().toMatchTypeOf<ChatJsonObject>();
    expectTypeOf<ChatTaskResult>().toMatchTypeOf<AutomationStudioTaskResult>();
    expectTypeOf<AutomationStudioTaskResult>().toMatchTypeOf<ChatTaskResult>();
  });
});

describe("ChatTransport", () => {
  it("leaves the results port optional, so a client without one is unchanged", () => {
    expectTypeOf<ChatTransport["results"]>().toEqualTypeOf<ChatResultsPort | undefined>();
    const optional: Record<string, never> extends Pick<ChatTransport, "results"> ? true : false = true;
    expect(optional).toBe(true);
  });
});
