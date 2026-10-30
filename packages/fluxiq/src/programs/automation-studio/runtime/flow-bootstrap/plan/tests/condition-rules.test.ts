// The condition rules ride on the submission's own format (t478). Lane D round
// 11 (`run-mv5yaapw-6d20d23d`) wrote a listing's `where` while every look, the
// only text that described one, was withdrawn: no withdrawal may take away the
// only description of a parameter a kept tool accepts. So every key the
// condition vocabulary accepts is named in the rules, and the rules are inside
// the loop format `core.submit_candidate` carries on its input schema. And they
// name the date bound (t790, run `run-mvswewhy-e4e469d4`).
import { AUTOMATION_STUDIO_RECORD_CONDITION_BOUNDS, AUTOMATION_STUDIO_RECORD_CONDITION_TEXTS, AUTOMATION_STUDIO_RECORD_CONDITION_WITHIN_UNITS } from "@fluxiq/contracts/automation-studio";
import { describe, expect, it } from "vitest";
import { AUTOMATION_STUDIO_FLOW_CONDITION_RULES, AUTOMATION_STUDIO_FLOW_SCRIPT_LOOP_FORMAT } from "../index.ts";

describe("the where condition rules", () => {
  it("name every comparison the condition vocabulary accepts, and presence, equals and not", () => {
    for (const key of [...AUTOMATION_STUDIO_RECORD_CONDITION_BOUNDS, ...AUTOMATION_STUDIO_RECORD_CONDITION_TEXTS, "equals", "is:", "not: true"]) {
      expect(AUTOMATION_STUDIO_FLOW_CONDITION_RULES).toContain(key);
    }
  });

  it("say a quantity is compared with a bound, never with a text test, and what number a bound reads", () => {
    expect(AUTOMATION_STUDIO_FLOW_CONDITION_RULES).toContain("A quantity -- a count, price, rating or amount -- is always compared with a bound, never a text test: a pattern reads characters, not the number");
    expect(AUTOMATION_STUDIO_FLOW_CONDITION_RULES).toContain("the total of a combined count it recognises");
  });

  // t790 (run `run-mvswewhy-e4e469d4`): "on or after" a day was written as a regex of three days.
  it("say a date is compared with a date bound written with as: date, never a pattern, and an undated row is never kept", () => {
    expect(AUTOMATION_STUDIO_FLOW_CONDITION_RULES).toContain("{\"field\": \"due\", \"atLeast\": \"2026-10-01\", \"as\": \"date\"}");
    expect(AUTOMATION_STUDIO_FLOW_CONDITION_RULES).toContain("atLeast with atMost keeps the days between, both included");
    expect(AUTOMATION_STUDIO_FLOW_CONDITION_RULES).toContain("A row whose value states no date it can read is never kept");
    expect(AUTOMATION_STUDIO_FLOW_CONDITION_RULES).toContain("A date is always compared with a date bound, never a pattern");
  });

  // t800 (K1): a bound relative to the run's now, and `within` in every unit it takes.
  it("say a bound may be relative to the run, and what within keeps, with every unit it takes", () => {
    expect(AUTOMATION_STUDIO_FLOW_CONDITION_RULES).toContain("relative to the run as today, yesterday, now or \"<n> <unit> ago\"");
    expect(AUTOMATION_STUDIO_FLOW_CONDITION_RULES).toContain("{\"field\": \"filed\", \"within\": \"7 days\"}");
    expect(AUTOMATION_STUDIO_FLOW_CONDITION_RULES).toContain("keeps the rows dated from n units before the run's now up to it");
    expect(AUTOMATION_STUDIO_FLOW_CONDITION_RULES).toContain("A day the request names is a bound with its year, never a within");
    for (const unit of AUTOMATION_STUDIO_RECORD_CONDITION_WITHIN_UNITS) expect(AUTOMATION_STUDIO_FLOW_CONDITION_RULES).toContain(unit);
  });

  it("are carried whole by the loop format the submission's input schema carries", () => {
    expect(AUTOMATION_STUDIO_FLOW_SCRIPT_LOOP_FORMAT).toContain(`names a column by field and must hold for a row to be kept. ${AUTOMATION_STUDIO_FLOW_CONDITION_RULES}`);
  });
});
