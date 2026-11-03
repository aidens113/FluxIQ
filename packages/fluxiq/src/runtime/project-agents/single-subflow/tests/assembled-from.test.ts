// What one supervisor run knows of the whole revisions it assembled
// (`../assembled-from.ts`): read back by a revision's number alone (t689), as
// the whole gate names the revision whose trial showed a kept condition.
import { describe, expect, it } from "vitest";
import { AutomationStudioProjectAssembledFrom } from "../assembled-from.ts";

const ONE = { subflowKey: "find_newest", briefId: "brief-1", revision: 2, digest: "a".repeat(64) };
const TWO = { subflowKey: "find_newest", briefId: "brief-2", revision: 5, digest: "b".repeat(64) };

describe("the proposals a whole revision was assembled from, by its number (t689)", () => {
  it("answers each noted revision's proposals as copies, and nothing for one this run did not assemble", () => {
    const made = AutomationStudioProjectAssembledFrom.of({});
    made.note({ revision: 1, digest: "c".repeat(64) }, [ONE]);
    made.note({ revision: 2, digest: "d".repeat(64) }, [TWO]);
    expect(made.madeOf(1)).toEqual([ONE]);
    expect(made.madeOf(2)).toEqual([TWO]);
    expect(made.madeOf(3)).toBeUndefined();
    made.madeOf(1)![0]!.revision = 9;
    expect(made.madeOf(1)).toEqual([ONE]);
  });
});
