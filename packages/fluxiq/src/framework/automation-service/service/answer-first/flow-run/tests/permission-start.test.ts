// @fluxiq-test-group real-sql
// The actual assembled Flow names all its consequences before the single start question. No browser or model.
import { afterEach, expect, it } from "vitest";
import { automationStudioAnswerFirstFlowRun } from "../index.ts";
import { flowRunFixture, LOANS_OUTPUT, savedStep } from "../../tests/fake-library-engine.ts";
import { READ_LOANS, RENEW_CARD, RENEW_LOAN } from "../../tests/fake-library.ts";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

it.each(["allow", "decline"] as const)("combines separate delete and send steps before the person's %s", async (answer) => {
  const fixture = await flowRunFixture({ answer }, cleanups);
  const starts: string[][] = [];
  fixture.ports.starting = async (classes) => {
    expect(fixture.target.reads).toBe(0);
    expect(fixture.target.presses).toEqual([]);
    starts.push([...classes]);
    await fixture.permissions.askAtStart({ classes, ask: true });
  };
  const steps = [
    savedStep(1, READ_LOANS, { recordOutput: LOANS_OUTPUT }),
    savedStep(2, RENEW_CARD, {}, { consequences: ["delete"] }),
    savedStep(3, RENEW_LOAN, {}, { consequences: ["send_or_publish"] })
  ];
  const outcome = await automationStudioAnswerFirstFlowRun(fixture.ports, { steps, stepsDigest: "digest.saved" });
  expect(starts).toEqual([["delete", "send_or_publish"]]);
  expect(fixture.asked).toHaveLength(1);
  if (answer === "allow") expect(outcome).toMatchObject({ kind: "ran", reachedEnd: true });
  else {
    expect(outcome).toMatchObject({ kind: "permission_declined" });
    expect(fixture.target.reads).toBe(0);
    expect(fixture.target.presses).toEqual([]);
  }
});
