import { expect, it } from "vitest";
import { AutomationInMemoryStateStore, stateValue } from "../../state/index.ts";
import { AutomationStudioRecordingController } from "../index.ts";

it("records store deltas and explicit checkpoints, then unsubscribes on stop", () => {
  const initialState = { timestamp: 10, namespaces: {} };
  const stateStore = new AutomationInMemoryStateStore(initialState);
  const controller = new AutomationStudioRecordingController({ recordingId: "controller", description: "A demonstration", startedAt: 10, initialState, stateStore, checkpointOnStart: true });
  stateStore.write("machine", "count", stateValue("integer", 1, 11), { source: "meter", metadata: { observed: true } });
  const changed = controller.current();
  expect(changed.description).toBe("A demonstration");
  expect(changed.timeline.map(entry => entry.type)).toEqual(["state_checkpoint", "state_delta"]);
  expect(changed.timeline[1]).toMatchObject({ sourceId: "meter", metadata: { observed: true }, deltas: [{ namespace: "machine", path: "count", change: "added" }] });
  changed.timeline.length = 0;
  expect(controller.current().timeline).toHaveLength(2);
  controller.appendCheckpoint(stateStore.snapshot(), { reason: "manual" });
  const stopped = controller.stop(5);
  expect(stopped.endedAt).toBe(10);
  stateStore.write("machine", "count", stateValue("integer", 2, 12));
  expect(controller.current()).toEqual(stopped);
});
