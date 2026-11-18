import { describe, expect, it } from "vitest";
import { BUILD_HEAP_MB, buildNodeOptions } from "../index.mjs";

describe("buildNodeOptions", () => {
  it("sets the build heap when NODE_OPTIONS is unset or blank", () => {
    expect(buildNodeOptions(undefined)).toBe(`--max-old-space-size=${BUILD_HEAP_MB}`);
    expect(buildNodeOptions("  ")).toBe(`--max-old-space-size=${BUILD_HEAP_MB}`);
  });

  it("appends to an existing value", () => {
    expect(buildNodeOptions("--trace-warnings")).toBe(`--trace-warnings --max-old-space-size=${BUILD_HEAP_MB}`);
  });

  it("keeps a heap size the caller already chose", () => {
    expect(buildNodeOptions("--max-old-space-size=8192")).toBe("--max-old-space-size=8192");
    expect(buildNodeOptions("--trace-warnings --max_old_space_size=8192")).toBe("--trace-warnings --max_old_space_size=8192");
  });

  it("uses 3584 MB, the value the image build relies on", () => {
    expect(BUILD_HEAP_MB).toBe(3584);
  });
});
