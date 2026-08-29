import { describe, expect, it } from "vitest";
import { namedResidualAudit, type NamedResidualExemption } from "./architecture-test-helpers";

function exemption(path: string, ceiling: number): NamedResidualExemption {
  return { path, ceiling, owner: "Owning phase", removalPhase: "Phase 11" };
}

describe("Automation Studio architecture residual audits", () => {
  it("accepts only an exact named residual baseline", () => {
    expect(namedResidualAudit(new Map([["root.tsx", 3]]), [exemption("root.tsx", 3)]).violations).toEqual([]);
  });

  it("rejects growth, loose ceilings, stale entries, and unexempted debt", () => {
    expect(namedResidualAudit(new Map([["root.tsx", 4]]), [exemption("root.tsx", 3)]).violations[0]).toMatch(/^GREW/u);
    expect(namedResidualAudit(new Map([["root.tsx", 2]]), [exemption("root.tsx", 3)]).violations[0]).toMatch(/^LOOSE CEILING/u);
    expect(namedResidualAudit(new Map(), [exemption("root.tsx", 3)]).violations[0]).toMatch(/^STALE EXEMPTION/u);
    expect(namedResidualAudit(new Map([["new-debt.ts", 1]]), []).violations).toEqual(["UNEXEMPTED new-debt.ts (1)"]);
  });

  it("rejects duplicate, wildcard, invalid, and unowned exemptions", () => {
    const audit = namedResidualAudit(new Map([
      ["root.tsx", 1],
      ["*.tsx", 1],
      ["invalid.ts", 1],
      ["unowned.ts", 1]
    ]), [
      exemption("root.tsx", 1),
      exemption("root.tsx", 1),
      exemption("*.tsx", 1),
      exemption("invalid.ts", 0),
      { path: "unowned.ts", ceiling: 1, owner: "", removalPhase: "" }
    ]);

    expect(audit.violations).toEqual(expect.arrayContaining([
      "DUPLICATE EXEMPTION root.tsx",
      "INVALID EXEMPTION PATH *.tsx",
      "INVALID EXEMPTION CEILING invalid.ts: 0",
      "UNOWNED unowned.ts"
    ]));
  });
});