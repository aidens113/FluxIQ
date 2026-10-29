import { describe, expect, it } from "vitest";
import type { AutomationStudioActionConsequence } from "../../../action-permissions/index.ts";
import { AutomationStudioSiteResetCreateBaselines, type AutomationStudioSiteResetRead, type AutomationStudioSiteResetSpot } from "../../site-reset/index.ts";
import { automationStudioSiteResetAdmission as admission, type AutomationStudioSiteResetAdmissionInput } from "../index.ts";

// Rule 4 over a page read whole (t791 fix 1): an identified creation pressed on one page names the ref of another page of
// its resource, one with no list the domain vouches for, read before it. Made-up fixtures: adding a book to a library's
// reading shelf from the book's own page; opaque tokens only.

const TAB = "r:library-tab-1";
/** "Add to reading shelf" on a book's own page: about the book, in no item. */
const ADD: AutomationStudioSiteResetSpot = { subject: "s:atlas", page: "s:atlas", scope: "p:atlas-page", resource: TAB };
/** The reading shelf: an empty state, or its books in plain blocks. */
const shelf = (subjects: string[], resource = TAB): AutomationStudioSiteResetRead => ({ state: {}, differs: [], location: "loc:shelf", scope: "p:shelf-page", resource, subjects });

const input = (control: AutomationStudioSiteResetSpot, door: "exploration" | "step", reference: unknown, consequences: AutomationStudioActionConsequence[] = ["create_new"]): AutomationStudioSiteResetAdmissionInput => ({
  declared: { effect: "mutate", consequences, control: { name: "Add to reading shelf", kind: "button", ...control } }, reference, door
});
/** The receipts with `read` observed and its receipts printed, as an exploration call's answer prints them. */
const receiptsAfter = (...reads: AutomationStudioSiteResetRead[]) => {
  const baselines = new AutomationStudioSiteResetCreateBaselines();
  for (const read of reads) {
    baselines.observed(read);
    baselines.receipts();
  }
  return { baselines, known: { ...baselines.known(), explored: () => [] } };
};
const CREATE = { kind: "refused", evidence: { ok: false, code: "candidate.create_baseline_required", failed: "no_destination_original", canMeet: "another_page" } };

describe("rule 4: an identified creation naming a page ref (t791)", () => {
  it("is admitted via destination where its subject was absent from the page read before it, an empty state included", () => {
    for (const before of [[], ["s:herbal"]]) {
      const { known } = receiptsAfter(shelf(before));
      for (const door of ["exploration", "step"] as const) {
        const verdict = admission(input(ADD, door, "destination-1"), known);
        expect(verdict).toMatchObject({ kind: "admit", witness: { via: "destination", ref: "destination-1" } });
        expect(verdict.kind === "admit" && verdict.witness?.via === "destination" ? verdict.witness.scope : undefined).not.toMatch(/^[A-Za-z0-9:_-]+$/u);
      }
    }
  });

  it("has no witness where its subject was already on the page: refused at the step door, admitted with none while exploring", () => {
    const { known } = receiptsAfter(shelf(["s:atlas"]));
    expect(admission(input(ADD, "step", "destination-1"), known)).toMatchObject(CREATE);
    expect(admission(input(ADD, "exploration", "destination-1"), known)).toEqual({ kind: "admit" });
    // The page fallback: a creation whose control names another subject still cannot hide its page's.
    expect(admission(input({ ...ADD, subject: "s:sold-by-branch" }, "step", "destination-1"), known)).toMatchObject(CREATE);
  });

  it("is never witnessed by a page ref read in another resource", () => {
    const { known } = receiptsAfter(shelf([], "r:library-tab-2"));
    expect(admission(input(ADD, "step", "destination-1"), known)).toMatchObject(CREATE);
    expect(admission(input(ADD, "exploration", "destination-1"), known)).toEqual({ kind: "admit" });
    // Read again in the press's own resource, that page has a ref of its own that does.
    const both = receiptsAfter(shelf([], "r:library-tab-2"), shelf([]));
    expect(admission(input(ADD, "step", "destination-2"), both.known)).toMatchObject({ kind: "admit", witness: { via: "destination", ref: "destination-2" } });
  });

  it("is a creation's witness alone: another reversible press naming a page ref has none from it, and no control's own list is a page", () => {
    const { baselines, known } = receiptsAfter(shelf(["s:atlas"]));
    for (const consequences of [["modify_existing"], ["delete"], ["create_new", "modify_existing"]] as AutomationStudioActionConsequence[][]) {
      expect(admission(input(ADD, "step", "destination-1", consequences), known)).toMatchObject({ kind: "refused", evidence: { code: "candidate.reset_witness_required" } });
    }
    // A control on the page itself, in no list: its scope is the page's, never the page read whole.
    expect(baselines.known().original("p:shelf-page", TAB)).toBeUndefined();
    expect(admission(input({ subject: "s:atlas", scope: "p:shelf-page", resource: TAB }, "step", undefined, ["delete"]), known)).toMatchObject({ kind: "refused", evidence: { code: "candidate.reset_witness_required" } });
  });
});
