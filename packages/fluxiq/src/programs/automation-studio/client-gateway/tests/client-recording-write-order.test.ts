import { expect, it } from "vitest";
import { ClientRecordingWriteOrder } from "../client-recording-write-order.ts";
import { ClientRecordingWriteOrder as CanonicalWriteOrder } from "../../../../client-gateway/recording/index.ts";

it("retains the original write-order constructor through the Studio compatibility export", () => {
  expect(ClientRecordingWriteOrder).toBe(CanonicalWriteOrder);
});
