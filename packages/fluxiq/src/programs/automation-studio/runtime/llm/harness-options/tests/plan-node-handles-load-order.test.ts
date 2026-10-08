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
// Each case starts from an empty module registry and imports in its own order,
// so the order is the variable under test. The bounds are written out rather
// than read from the harness, because reading them would load the harness
// first and change the order being tested.

import { beforeEach, describe, expect, it, vi } from "vitest";

const HANDLE_MAX_LENGTH = 64;
const MAX_HANDLES = 16;

type HandleCheck = typeof import("../plan-node-handles.ts");

const LOAD_ORDERS: Array<{ name: string; load: () => Promise<HandleCheck> }> = [
  {
    name: "bootstrap-completion loads first (the order that failed)",
    load: async () => {
      await import("../bootstrap-completion.ts");
      return import("../plan-node-handles.ts");
    }
  },
  {
    name: "the handle check loads first",
    load: async () => {
      const check = await import("../plan-node-handles.ts");
      await import("../bootstrap-completion.ts");
      return check;
    }
  }
];

describe.each(LOAD_ORDERS)("the plan-node handle check when $name", ({ load }) => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("refuses a token outside the handle syntax", async () => {
    const { automationStudioPlanNodeHandleSites, automationStudioPlanNodeParametersNameHandle } = await load();
    const parameters = { target: { handle: "not a handle!" } };
    expect(automationStudioPlanNodeHandleSites(parameters).malformed).toBe(true);
    expect(automationStudioPlanNodeParametersNameHandle(parameters)).toBe(true);
  });

  it("refuses a token longer than a handle may be", async () => {
    const { automationStudioPlanNodeHandleSites } = await load();
    expect(automationStudioPlanNodeHandleSites({ target: { handle: "h".repeat(HANDLE_MAX_LENGTH + 1) } }).malformed).toBe(true);
  });

  it("refuses more references than a node may name", async () => {
    const { automationStudioPlanNodeHandleSites } = await load();
    const targets = Array.from({ length: MAX_HANDLES + 1 }, (_, index) => ({ handle: `h${index}` }));
    expect(automationStudioPlanNodeHandleSites({ targets }).malformed).toBe(true);
  });

  it("still accepts a well-formed handle at the longest a handle may be", async () => {
    const { automationStudioPlanNodeHandleSites } = await load();
    const handle = "h".repeat(HANDLE_MAX_LENGTH);
    expect(automationStudioPlanNodeHandleSites({ target: { handle, location: "start" } }))
      .toEqual({ sites: [{ path: ["target"], handle, location: "start" }], malformed: false });
  });
});
