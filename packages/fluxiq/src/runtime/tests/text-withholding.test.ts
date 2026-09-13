import { describe, expect, it } from "vitest";
import { FLUXIQ_RUNTIME_WITHHELD_VALUE, fluxiqRuntimeTextWithholding } from "../index.ts";

const WITHHELD = FLUXIQ_RUNTIME_WITHHELD_VALUE;
// Obviously synthetic: a realistic credential would prove nothing here.
const INNER = "synthetic-inner-value";
const OUTER = `synthetic-outer-value-around-${INNER}`;

describe("the runtime's one text withholding rule", () => {
  it("replaces a withheld text that contains another whole, whichever order the texts arrive in, leaving no fragment", () => {
    for (const texts of [[INNER, OUTER], [OUTER, INNER]]) {
      const withhold = fluxiqRuntimeTextWithholding(texts);
      expect(withhold(`Could not type ${OUTER} into #field.`)).toBe(`Could not type ${WITHHELD} into #field.`);
      expect(withhold(`typed ${INNER} alone`)).toBe(`typed ${WITHHELD} alone`);
    }
  });

  it("replaces withheld texts that overlap together, by one marker", () => {
    const withhold = fluxiqRuntimeTextWithholding(["synthetic-left-over", "over-lap-synthetic-right"]);
    expect(withhold("a synthetic-left-over-lap-synthetic-right b")).toBe(`a ${WITHHELD} b`);
  });

  it("keeps a separate marker for each occurrence that only touches the next", () => {
    expect(fluxiqRuntimeTextWithholding(["abc"])("abcabc and abc")).toBe(`${WITHHELD}${WITHHELD} and ${WITHHELD}`);
  });

  it("never rewrites a marker, so a string withheld twice reads as it did withheld once", () => {
    const withhold = fluxiqRuntimeTextWithholding(["held", "e"]);
    const once = withhold(`held e ${WITHHELD}`);

    expect(once).toBe(`${WITHHELD} ${WITHHELD} ${WITHHELD}`);
    expect(withhold(once)).toBe(once);
  });

  it("withholds nothing for no texts or only empty ones, and hands back a string holding none of them", () => {
    expect(fluxiqRuntimeTextWithholding([])("keep")).toBe("keep");
    expect(fluxiqRuntimeTextWithholding([""])("keep")).toBe("keep");
    expect(fluxiqRuntimeTextWithholding(["absent"])("keep")).toBe("keep");
  });
});
