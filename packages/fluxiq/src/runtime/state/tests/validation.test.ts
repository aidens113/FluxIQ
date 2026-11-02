import { expect, it } from "vitest";
import { validateStateSnapshot } from "../index.ts";
import type { StateSnapshot } from "@fluxiq/contracts/state";

it("requires an explicit content reference acceptance policy", () => {
  const snapshot: StateSnapshot = { timestamp: 1, namespaces: {}, presentation: { defaultFrameId: "frame", visualFrames: [{ id: "frame", coordinateSpace: { width: 2, height: 3, unit: "cell" }, layers: [{ id: "image", kind: "image", contentRef: "asset:one", bounds: { x: 0, y: 0, width: 2, height: 3 } }] }] } };
  expect(validateStateSnapshot(snapshot, { accepts: value => value === "asset:one", rejectedMessage: "Asset unavailable." }).issues).toEqual([]);
  expect(validateStateSnapshot(snapshot, { accepts: () => false, rejectedMessage: "Asset unavailable." }).issues).toEqual([{ severity: "error", code: "state.visual_layer_unsafe_content_ref", message: "Asset unavailable.", path: "presentation.visualFrames.0.layers.0.contentRef" }]);
});
