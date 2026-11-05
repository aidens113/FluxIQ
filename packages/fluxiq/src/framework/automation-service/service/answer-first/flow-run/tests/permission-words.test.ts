// @fluxiq-test-group real-sql
// Naming the control in a saved Flow's permission question: the words of a saved step reach the
// question, are screened, and decide nothing. A lending library; no model, no browser.
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AutomationStudioFlowDraftStep } from "../../../../../../runtime/flow-authoring/draft/index.ts";
import type { AutomationStudioLlmEvidenceRuntimeBinding } from "../../../../../../runtime/llm/index.ts";
import { automationStudioAnswerFirstFlowRun } from "../index.ts";
import { flowRunFixture, LOANS_OUTPUT, savedStep, type FlowRunFixtureOptions } from "../../tests/fake-library-engine.ts";
import { READ_LOANS, RENEW_CARD } from "../../tests/fake-library.ts";

vi.setConfig({ testTimeout: 60_000 });

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });

const CONTROL = "Cancel library card";
/** Built from parts so no key-shaped literal sits in the source. */
const FAKE_KEY = ["sk", "a1b2c3d4e5f6g7h8i9j0k1l2"].join("-");

/** The domain declares the control by this name as it resolves the step, as a web domain does. */
const declaring = (name: string): Partial<AutomationStudioLlmEvidenceRuntimeBinding> => ({
  resolvePlanNodeParameters: async ({ parameters, permission, declaredConsequences }) => {
    if (declaredConsequences?.length) await permission({ consequences: declaredConsequences, control: { name, kind: "button" }, verb: "press" });
    return { status: "resolved", parameters };
  }
});

/** Read the loans, then cancel the card, with the step's recorded words as given. */
function steps(words: AutomationStudioFlowDraftStep["words"] | undefined): AutomationStudioFlowDraftStep[] {
  const cancel = savedStep(2, RENEW_CARD, {}, { consequences: ["delete"] });
  return [savedStep(1, READ_LOANS, { recordOutput: LOANS_OUTPUT }), words ? { ...cancel, words } : cancel];
}

async function asked(name: string, words: AutomationStudioFlowDraftStep["words"] | undefined, over: FlowRunFixtureOptions = {}, nobody = false) {
  const fixture = await flowRunFixture({ ...(nobody ? {} : { answer: "decline" as const }), binding: declaring(name), ...over }, cleanups);
  const outcome = await automationStudioAnswerFirstFlowRun(fixture.ports, { steps: steps(words), stepsDigest: "digest.saved" });
  return { outcome, question: fixture.asked, pressed: fixture.target.presses };
}

describe("a saved step's words in its permission question", () => {
  it("names the control a saved press step carries", async () => {
    const { outcome, question } = await asked(CONTROL, { target: CONTROL });
    expect(outcome).toEqual({ kind: "permission_declined", consequences: ["delete"] });
    expect(question).toHaveLength(1);
    expect(question[0]).toContain(CONTROL);
    expect(question[0]).not.toContain("cannot name here");
  });

  it("asks in today's wording when the step has no words, and still asks", async () => {
    const { question } = await asked(CONTROL, undefined);
    expect(question).toHaveLength(1);
    expect(question[0]).toContain("a control it cannot name here");
    expect(question[0]).not.toContain(CONTROL);
  });

  it("never lets words shaped like a secret reach the question", async () => {
    const name = `${CONTROL} ${FAKE_KEY}`;
    const { question } = await asked(name, { target: name });
    expect(question).toHaveLength(1);
    expect(question[0]).not.toContain(FAKE_KEY);
    expect(question[0]).not.toContain("a1b2c3d4");
    expect(question[0]).toContain("a control it cannot name here");
  });

  it("leaves markup and selector-shaped words unnamed", async () => {
    for (const words of ["<button>Cancel</button>", "#card-12 > button.danger"]) {
      const { question } = await asked(words, { target: words });
      expect(question[0]).toContain("a control it cannot name here");
    }
  });
});

/** What was decided and done; a step's label is Core's reading of the same words, so it is not compared. */
const decision = (outcome: Awaited<ReturnType<typeof asked>>["outcome"]) => outcome.kind === "ran" ? { kind: outcome.kind, reachedEnd: outcome.reachedEnd, ran: outcome.steps.map((step) => step.ran) } : outcome;

describe("the words change no decision", () => {
  const cases: { name: string; over: FlowRunFixtureOptions; nobody?: boolean; expected: { kind: string; presses: number } }[] = [
    { name: "permitted", over: { permittedConsequences: ["delete"] }, expected: { kind: "ran", presses: 1 } },
    { name: "refused (nobody to ask)", over: {}, nobody: true, expected: { kind: "permission_declined", presses: 0 } },
    { name: "declined", over: { answer: "decline" }, expected: { kind: "permission_declined", presses: 0 } },
    { name: "granted", over: { answer: "allow" }, expected: { kind: "ran", presses: 1 } }
  ];
  for (const { name, over, nobody, expected } of cases) {
    it(`is the same ${name} with and without them`, async () => {
      const [named, unnamed] = await Promise.all([asked(CONTROL, { target: CONTROL }, over, nobody), asked(CONTROL, undefined, over, nobody)]);
      expect(named.outcome.kind).toBe(expected.kind);
      expect(decision(named.outcome)).toEqual(decision(unnamed.outcome));
      expect(named.pressed.length).toBe(expected.presses);
      expect(named.pressed.length).toBe(unnamed.pressed.length);
      expect(named.question.length).toBe(unnamed.question.length);
    });
  }
});
