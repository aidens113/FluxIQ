import { expect, test } from "vitest";
import type { ClientGatewayActivity } from "@fluxiq/contracts/client-gateway";
import { ACTIVITY_RESULT_CHECK_LABELS } from "../../activity-action/index.ts";
import { UnitSituation } from "../unit-situation.ts";
import { ACTIVITY_DOUBTED_HEADLINE, endsOnDoubt } from "../doubted-ending.ts";
import { activityHeadline } from "../headline.ts";
import { TEST_HOST_WORDS } from "./test-host-words.ts";

test("a run the check only doubted, with the Flow unchanged, does not read 'Couldn't fix your Flow'", () => {
  expect(activityHeadline("run", "failed", TEST_HOST_WORDS, { repairing: true, doubted: true })).toBe(ACTIVITY_DOUBTED_HEADLINE);
  expect(activityHeadline("run", "failed", TEST_HOST_WORDS, { repairing: true })).toBe("Couldn't fix your Flow");
  expect(activityHeadline("build", "failed", TEST_HOST_WORDS, { doubted: true })).toBe("Build failed");
});

test("a run that finished with its result not confirmed never reads as a plain success", () => {
  expect(activityHeadline("run", "done", TEST_HOST_WORDS, { unconfirmed: true })).toBe("Run finished, result not confirmed");
  expect(activityHeadline("run", "done", TEST_HOST_WORDS)).toBe("Run finished");
  expect(activityHeadline("build", "done", TEST_HOST_WORDS, { unconfirmed: true })).toBe("Flow ready");
});

test("the ending is recognised in a row's label or text", () => {
  expect(endsOnDoubt("Run failed: it saved 3 rows, but the check doubted them, the repair changed nothing, and the saved Flow is unchanged.")).toBe(true);
  expect(endsOnDoubt(undefined, "Run failed")).toBe(false);
});

test("a run's unit remembers an unconfirmed result check until a check passes", () => {
  const unit = new UnitSituation();
  const at = (label: string, status: "succeeded" | "failed", title = "Result check") => ({ sequence: 1, activityId: "run:r1", phase: "verifying", label, detail: { kind: "check", title, status } }) as ClientGatewayActivity;
  expect(unit.observe(at(ACTIVITY_RESULT_CHECK_LABELS.unconfirmed, "failed")).unconfirmed).toBe(true);
  expect(unit.observe(at(ACTIVITY_RESULT_CHECK_LABELS.answers, "succeeded")).unconfirmed).toBe(false);
  expect(unit.observe(at(ACTIVITY_RESULT_CHECK_LABELS.unchecked, "failed")).unconfirmed).toBe(true);
  expect(unit.observe({ ...at("Run started", "succeeded"), activityId: "run:r2", detail: { kind: "step", title: "Run started", status: "started" } } as ClientGatewayActivity).unconfirmed).toBe(false);
});
