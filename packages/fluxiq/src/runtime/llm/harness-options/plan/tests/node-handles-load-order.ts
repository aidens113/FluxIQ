// The handle check holds whichever module of its import graph loads first.
//
// `plan-node-handles.ts` bounds a handle reference by three constants the
// harness owns: the token pattern, its maximum length and how many a node may
// name. On 2026-10-07 (t358) those constants, reached through the
// `llm/harness.ts` re-export, read as `undefined` under the test loader when
// `bootstrap-completion.ts` was the first module of the cycle to load:
// `export *` copies only what its source module has defined so far, and the
// harness barrel was still mid-evaluation. `new RegExp(undefined)` matches
// everything and `length > undefined` is never true, so in that load order the
// check accepted any token at all.
//
// Each load order is its own test file, whose static imports name the modules
// in that order: a file starts from an empty module registry, and its imports
// evaluate in the order they are written, while the file is collected. Loading
// inside each test instead, after `vi.resetModules()`, put the whole cold
// transform and evaluation of `bootstrap-completion.ts`'s graph inside a 15 s
// test (27 s of transform for this file run alone), then evaluated that graph
// again in every case, so the cases timed out before they checked anything.
// Collected like any other test file, each order loads its graph once.
//
// This module is shared by both files and imports nothing of that graph, so it
// cannot change the order under test. The bounds are written out rather than
// read from the harness, because reading them would load the harness first and
// change the order being tested.

import { describe, expect, it } from "vitest";

const HANDLE_MAX_LENGTH = 64;
const MAX_HANDLES = 16;

export type PlanNodeHandleCheck = typeof import("../node-handles.ts");

/** The four cases, against the handle check one load order produced. */
export function describeHandleCheckLoadedIn(order: string, check: PlanNodeHandleCheck): void {
  describe(`the plan-node handle check when ${order}`, () => {
    it("refuses a token outside the handle syntax", () => {
      const parameters = { target: { handle: "not a handle!" } };
      expect(check.automationStudioPlanNodeHandleSites(parameters).malformed).toBe(true);
      expect(check.automationStudioPlanNodeParametersNameHandle(parameters)).toBe(true);
    });

    it("refuses a token longer than a handle may be", () => {
      expect(check.automationStudioPlanNodeHandleSites({ target: { handle: "h".repeat(HANDLE_MAX_LENGTH + 1) } }).malformed).toBe(true);
    });

    it("refuses more references than a node may name", () => {
      const targets = Array.from({ length: MAX_HANDLES + 1 }, (_, index) => ({ handle: `h${index}` }));
      expect(check.automationStudioPlanNodeHandleSites({ targets }).malformed).toBe(true);
    });

    it("still accepts a well-formed handle at the longest a handle may be", () => {
      const handle = "h".repeat(HANDLE_MAX_LENGTH);
      expect(check.automationStudioPlanNodeHandleSites({ target: { handle, location: "start" } }))
        .toEqual({ sites: [{ path: ["target"], handle, location: "start" }], malformed: false });
    });
  });
}
