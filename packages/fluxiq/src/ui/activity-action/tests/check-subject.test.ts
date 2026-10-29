import { expect, test } from "vitest";
import { activityActionCheckSubject } from "../check-subject.ts";

test("a check of what a test would store is named for the test, a run's rows for the run", () => {
  expect(activityActionCheckSubject("8 rows would be stored. The result is not confirmed.")).toBe("Check of a test's result");
  expect(activityActionCheckSubject("No rows would be stored.")).toBe("Check of a test's result");
  expect(activityActionCheckSubject("13 rows came back. The check found a gap.")).toBe("Check of the run's result");
  expect(activityActionCheckSubject("Rows came back in 2 record sets: 4 and 2 rows, no row in more than one set.")).toBe("Check of the run's result");
});

test("a check with no count keeps the kind's own name", () => {
  expect(activityActionCheckSubject("The result could not be checked.")).toBeUndefined();
  expect(activityActionCheckSubject(undefined)).toBeUndefined();
});
