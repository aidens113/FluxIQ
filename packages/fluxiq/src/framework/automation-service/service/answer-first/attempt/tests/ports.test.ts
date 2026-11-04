// An attempt's limits read the process's person-wait clock, so a locked key that waits for
// hours does not use up a limit on the task (the task ends only with its result or budget).

import { expect, it } from "vitest";
import { automationStudioPersonWaitClock } from "../../../../../../runtime/models/secrets/index.ts";
import { automationStudioAnswerFirstAttemptPorts } from "../ports.ts";

it("counts a wait recorded on this Flow and lends none to another", async () => {
  const scope = { projectId: "project-ports", flowId: "flow-ports" };
  const ports = automationStudioAnswerFirstAttemptPorts({});
  expect(ports.personHeldMs?.(scope)).toBe(0);
  const end = automationStudioPersonWaitClock.begin(scope);
  await new Promise((resolve) => setTimeout(resolve, 5));
  end();
  expect(ports.personHeldMs?.(scope)).toBeGreaterThan(0);
  expect(ports.personHeldMs?.({ ...scope, flowId: "flow-other" })).toBe(0);
});
