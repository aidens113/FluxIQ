// The words a refused test ends with (t775): one change left as the test would end, and no claim that
// the build puts the site back before every test.
import { expect, test } from "vitest";
import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";

import { activityTestEnding } from "../test-ending.ts";

const ending = (code: string) => activityTestEnding({ detail: { text: `Result: ${code}` } } as ClientGatewayActivity, false);

test("a test refused for a change that already leaves the site as the test would end says so", () => {
  expect(ending("candidate.trial_starts_in_end_state")).toBe("The test didn't run: one change this build made already leaves the site as the test would end, so that one change has to be put back first");
});

test("a step with no place named for its change is told, and no ending claims a reset before every test", () => {
  expect(ending("candidate.trial_step_unwitnessed")).toContain("has to be tried once");
  for (const code of ["candidate.trial_reset_required", "candidate.trial_start_differs"]) expect(ending(code), code).not.toContain("put back the way the build found it");
});
