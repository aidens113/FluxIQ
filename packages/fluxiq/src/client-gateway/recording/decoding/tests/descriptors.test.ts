import { expect, it } from "vitest";
import { decodeRecordingEnvironment, decodeRecordingSources, decodeRecordingActionChannels } from "../index.ts";

it("retains exact shared descriptors and refuses malformed supplied descriptors", () => {
  const environment = { id: "environment", label: "Machine", kind: "simulator", domainId: null, capabilities: ["observe"], metadata: { exact: true } };
  const sources = [{ id: "source", label: "Signals", kind: "derived", schemaId: "schema", schemaVersion: "1", metadata: { original: true } }];
  const channels = [{ id: "channel", label: "Control", actionTypes: ["activate"], capabilities: ["control"], metadata: { exact: true } }];
  expect(decodeRecordingEnvironment(environment)).toBe(environment);
  expect(decodeRecordingSources(sources)).toBe(sources);
  expect(decodeRecordingActionChannels(channels)).toBe(channels);
  expect(() => decodeRecordingEnvironment({ ...environment, capabilities: [1] })).toThrow("recording.invalid_environment");
  expect(() => decodeRecordingSources([{ ...sources[0], kind: "fabricated" }])).toThrow("recording.invalid_sources");
  expect(() => decodeRecordingActionChannels([{ ...channels[0], actionTypes: "activate" }])).toThrow("recording.invalid_action_channels");
});
