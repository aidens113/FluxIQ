import { describe, expect, it } from "vitest";
import { readCssManifest } from "../css-manifest-test-helper";

const globalCss = readCssManifest(new URL("../../../app/globals.css", import.meta.url));
const studioCss = readCssManifest(new URL("../../../app/(panel)/flows/[flowId]/graph/graph.css", import.meta.url));

describe("web surface hierarchy", () => {
  // The surface roles are the package's tokens (--canvas, --surface, --surface-raised,
  // --accent-row, --code-bg); the panel must not define its own copies of them.
  it("defines no surface roles of its own", () => {
    for (const role of ["--surface-shell", "--surface-pane", "--surface-tool", "--surface-selected", "--surface-code", "--content-code"]) {
      expect(globalCss).not.toContain(`${role}:`);
    }
  });

  it("keeps Studio view colours on the role aliases", () => {
    expect(globalCss).not.toContain(".automation-studio-shell");
    expect(studioCss).not.toMatch(/background:\s*#(?:0f141a|0f1720|111827|101820|0f172a)/i);
  });
});
