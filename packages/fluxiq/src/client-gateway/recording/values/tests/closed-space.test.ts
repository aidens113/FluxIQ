import { expect, it } from "vitest";
import type { ClosedClientRecording } from "../../internal/index.ts";
import { reserveClosedRecordingOwner } from "../index.ts";

it("retains at most 32 closed owners, leaving existing-owner insertion order intact", () => {
  const owners = new Map<string, ClosedClientRecording>();
  const closed = () => ({ discardedEvents: 0, discardedActions: 0, reported: false });
  for (let index = 0; index < 32; index++) owners.set(String(index), closed());
  reserveClosedRecordingOwner(owners, "0");
  expect(owners.size).toBe(32);
  expect([...owners.keys()][0]).toBe("0");
  reserveClosedRecordingOwner(owners, "new");
  owners.set("new", closed());
  expect(owners.size).toBe(32);
  expect(owners.has("0")).toBe(false);
  expect([...owners.keys()][0]).toBe("1");
});
