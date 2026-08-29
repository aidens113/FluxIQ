import { describe, expect, it } from "vitest";
import { bboxZIndex, boundsForSurface, clipBounds } from "./state-geometry";
import { boundsContains, directTextOverlaps, fittedTextStyle } from "./state-text-layout";
import { visualToneFromMetadata } from "./state-visual-classification";
import { compactStateSelection, stateSelectionKey } from "./state-view-selection";

describe("State visual geometry", () => {
  it("converts document bounds into screenshot coordinates", () => {
    const metrics = {
      surface: "screenshot" as const,
      coordinate: { width: 800, height: 600 },
      image: { width: 800, height: 600 },
      aspect: { width: 800, height: 600 },
      scroll: { x: 50, y: 100 }
    };
    expect(boundsForSurface({ x: 70, y: 130, width: 20, height: 30 }, "document", metrics))
      .toEqual({ x: 20, y: 30, width: 20, height: 30 });
  });

  it("clips invalid geometry and ranks smaller selected bounds above parents", () => {
    expect(clipBounds({ x: -10, y: 5, width: 30, height: 40 }, 20, 30))
      .toEqual({ x: 0, y: 5, width: 20, height: 25 });
    expect(bboxZIndex({ x: 0, y: 0, width: 10, height: 10 }, 100, 100, true))
      .toBeGreaterThan(bboxZIndex({ x: 0, y: 0, width: 80, height: 80 }, 100, 100, false));
  });
});

describe("State text and classification", () => {
  it("fits text to bounded regions and suppresses duplicated parent text", () => {
    expect(fittedTextStyle({ x: 0, y: 0, width: 80, height: 20 }, "Submit").paddingX).toBe(5);
    expect(boundsContains({ x: 0, y: 0, width: 100, height: 100 }, { x: 10, y: 10, width: 20, height: 20 })).toBe(true);
    expect(directTextOverlaps("Submit order", "submit")).toBe(true);
  });

  it("classifies controls, navigation, media, and disabled elements", () => {
    expect(visualToneFromMetadata({ tagName: "button" })).toBe("control");
    expect(visualToneFromMetadata({ role: "navigation" })).toBe("navigation");
    expect(visualToneFromMetadata({ tagName: "img" })).toBe("media");
    expect(visualToneFromMetadata({ disabled: true })).toBe("disabled");
  });
});

describe("State selection helpers", () => {
  it("compacts optional fields and creates stable selection keys", () => {
    expect(compactStateSelection({ sourceId: "source.1", evidenceId: undefined })).toEqual({ sourceId: "source.1" });
    expect(stateSelectionKey({ kind: "state", id: "state.1", sourceId: "source.1", phase: "input" }))
      .toContain("source.1");
  });
});
