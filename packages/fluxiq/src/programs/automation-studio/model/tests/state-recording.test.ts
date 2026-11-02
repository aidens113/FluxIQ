import { expect, it } from "vitest";
import { AutomationInMemoryStateStore, stateValue } from "../state-store.ts";
import { createRecordingSession, appendRecordingEntry } from "../recording-framework.ts";
import { RecordingDomainRegistry } from "../recording-domain.ts";
import * as state from "../../../../runtime/state/index.ts";
import * as recording from "../../../../runtime/recording/index.ts";
it("retains canonical foundation implementation identities through old exports", () => {
  expect(AutomationInMemoryStateStore).toBe(state.AutomationInMemoryStateStore);
  expect(stateValue).toBe(state.stateValue);
  expect(createRecordingSession).toBe(recording.createRecordingSession);
  expect(appendRecordingEntry).toBe(recording.appendRecordingEntry);
  expect(RecordingDomainRegistry).toBe(recording.RecordingDomainRegistry);
});
