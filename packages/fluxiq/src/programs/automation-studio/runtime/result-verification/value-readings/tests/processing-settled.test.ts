import { describe, expect, it } from "vitest";
import { automationStudioResultProcessingReadings } from "../processing-readings.ts";
import { CATALOGUE_NOW, CATALOGUE_PROCESS, CATALOGUE_QUOTED_YES, processingCatalogue, processingVerdict } from "./processing-catalogue.ts";

const conditionOf = (summary: ReturnType<typeof processingCatalogue>) => summary.recordSets[0]!.processing!.conditions![0]!;

describe("actual record-output processing evidence reaches the runtime verdict", () => {
  it("settles actual tested exclusions and accepts an affirmative model judgement quoting their condition", () => {
    const summary = processingCatalogue();
    expect(summary.recordSets[0]!.processing!.conditions![0]!.leftOutSettled).toEqual(["The Clockmaker's Almanac", "Songs of the Tides"]);
    expect(processingVerdict(summary, CATALOGUE_QUOTED_YES)).toMatchObject({ verdict: "answers" });
  });

  it("retains the request quote and explicit affirmative judgement obligations", () => {
    const summary = processingCatalogue();
    expect(processingVerdict(summary, "Condition 1 is correct.")).toMatchObject({ verdict: "unsure", code: "core.result.exclusion_evidence_missing" });
    expect(processingVerdict(summary, CATALOGUE_QUOTED_YES, "unknown").verdict).not.toBe("answers");
    expect(processingVerdict(summary, CATALOGUE_QUOTED_YES, "no").verdict).not.toBe("answers");
  });

  it("keeps legacy and missing witnesses subject to the original per-row obligations", () => {
    for (const legacy of [true, false]) {
      const summary = processingCatalogue({ changeAccount: (account) => {
        if (legacy) delete account.conditions![0]!.evaluation;
        for (const row of account.conditions![0]!.leftOutOnlyByThis) delete row.tested;
      } });
      expect(conditionOf(summary).leftOutSettled).toBeUndefined();
      expect(processingVerdict(summary, CATALOGUE_QUOTED_YES)).toMatchObject({ verdict: "unsure", code: "core.result.exclusion_evidence_missing" });
    }
  });

  it("will not accept a witness conflicting with its own condition or a changed authored condition", () => {
    const wrongContext = processingCatalogue({ changeAccount: (account) => {
      account.conditions![0]!.evaluation!.condition.equals = "On loan";
    } });
    expect(conditionOf(wrongContext).evaluation).toBeUndefined();
    const staleDeclaration = processingCatalogue({ authored: { where: [{ field: "shelf", equals: "On loan" }] } });
    expect(conditionOf(staleDeclaration).leftOutSettled).toBeUndefined();
    expect(processingVerdict(staleDeclaration, CATALOGUE_QUOTED_YES).verdict).not.toBe("answers");
    const conflictingCell = processingCatalogue({ changeAccount: (account) => {
      account.conditions![0]!.leftOutOnlyByThis[0]!.tested = { state: "present", value: "Available today" };
    } });
    expect(conditionOf(conflictingCell).leftOutSettled).toEqual(["Songs of the Tides"]);
    expect(processingVerdict(conflictingCell, CATALOGUE_QUOTED_YES).verdict).not.toBe("answers");
  });

  it("does not substitute a snapshot for missing authored Flow context", () => {
    const summary = processingCatalogue({ withoutNodes: true });
    expect(conditionOf(summary).evaluation).toBeDefined();
    expect(conditionOf(summary).leftOutSettled).toBeUndefined();
    expect(processingVerdict(summary, CATALOGUE_QUOTED_YES)).toMatchObject({ verdict: "unsure", code: "core.result.exclusion_evidence_missing" });
  });

  it("rejects misaligned witness arrays and condition indices rather than borrowing another row's proof", () => {
    const entry = conditionOf(processingCatalogue());
    const authored = CATALOGUE_PROCESS.where![0]!;
    expect(automationStudioResultProcessingReadings({ ...entry, leftOutObservations: entry.leftOutObservations!.slice(1) }, authored, 1)).toBeUndefined();
    expect(automationStudioResultProcessingReadings({ ...entry, number: 2 }, authored, 1)).toBeUndefined();
  });

  it("reads malformed public-contract proof as unavailable rather than trusting its assertions", () => {
    for (const invalid of [
      { condition: { field: "shelf", equals: "Available today" }, now: "yesterday" },
      { condition: { field: "shelf", equals: { claimed: true } }, now: CATALOGUE_NOW },
      { condition: { field: "shelf", equals: "Available today" }, now: CATALOGUE_NOW, settled: true }
    ]) {
      const summary = processingCatalogue({ changeAccount: (account) => { Reflect.set(account.conditions![0]!, "evaluation", invalid); } });
      expect(conditionOf(summary).leftOutSettled).toBeUndefined();
      expect(processingVerdict(summary, CATALOGUE_QUOTED_YES).verdict).not.toBe("answers");
    }
    for (const invalid of [{ state: "absent", value: "Available today" }, { state: "present", value: 42 }, { state: "proven", settled: true }]) {
      const summary = processingCatalogue({ changeAccount: (account) => {
        for (const row of account.conditions![0]!.leftOutOnlyByThis) Reflect.set(row, "tested", invalid);
      } });
      expect(conditionOf(summary).leftOutSettled).toBeUndefined();
      expect(processingVerdict(summary, CATALOGUE_QUOTED_YES).verdict).not.toBe("answers");
    }
  });

  it("preserves conflicting duplicate labels as unresolved, while identical captures can share a reading", () => {
    const summary = processingCatalogue({ rows: [
      { title: "Kept", shelf: "Available today" },
      { title: "Shared", shelf: "On loan" }, { title: "Shared", shelf: "In transit" },
      { title: "Repeated", shelf: "On loan" }, { title: "Repeated", shelf: "On loan" }
    ] });
    expect(conditionOf(summary).leftOutSettled).toEqual(["Repeated"]);
    expect(processingVerdict(summary, CATALOGUE_QUOTED_YES).verdict).not.toBe("answers");
  });

  it("screens denied tested fields, denied labels and missing declarations before transport", () => {
    const deniedCell = processingCatalogue({ deniedKeys: ["shelf"] });
    expect(conditionOf(deniedCell).evaluation).toBeUndefined();
    expect(conditionOf(deniedCell).leftOutObservations).toBeUndefined();
    expect(conditionOf(deniedCell).leftOutSettled).toBeUndefined();
    expect(deniedCell.withheld).toBe(true);
    const deniedLabel = processingCatalogue({ deniedKeys: ["title"] });
    expect(conditionOf(deniedLabel).leftOutOnlyByThis).toEqual(["(withheld)", "(withheld)"]);
    expect(conditionOf(deniedLabel).leftOutSettled).toBeUndefined();
    const undeclared = processingCatalogue({ withoutDeclaration: true });
    expect(conditionOf(undeclared)).toEqual({ number: 1, rejected: 2, alone: 2 });
    expect(undeclared.withheld).toBe(true);
  });

  it("withholds secret-shaped tested cells and operands without manufacturing absence", () => {
    const secret = "sk-synthetic-test-credential-12345678901234567890";
    const summary = processingCatalogue({ rows: [{ title: "Kept", shelf: "Available today" }, { title: "Unsaid", shelf: secret }] });
    expect(conditionOf(summary).leftOutObservations).toEqual([{ state: "withheld" }]);
    expect(conditionOf(summary).leftOutSettled).toBeUndefined();
    expect(JSON.stringify(summary)).not.toContain(secret);
    expect(summary.withheld).toBe(true);
    const operand = processingCatalogue({ process: { where: [{ field: "shelf", equals: secret }] } });
    expect(conditionOf(operand).condition).toBeUndefined();
    expect(conditionOf(operand).evaluation).toBeUndefined();
    expect(JSON.stringify(operand)).not.toContain(secret);
  });

  it("settles measured missing values under a text test but never an unavailable placeholder", () => {
    const summary = processingCatalogue({ process: { where: [{ field: "shelf", matches: "^Available" }] }, rows: [
      { title: "Missing" }, { title: "Null", shelf: null }, { title: "Blank", shelf: "  " }, { title: "Opaque", shelf: "[withheld]" }
    ] });
    expect(conditionOf(summary).leftOutSettled).toEqual(["Missing", "Null", "Blank"]);
    expect(conditionOf(summary).settledKind).toBe("text");
    expect(conditionOf(summary).settled).toContain("quote, once");
  });

  it("uses the actual processing clock and supports compound numeric bounds without treating nonnumbers as known failures", () => {
    const dated = processingCatalogue({ process: { where: [{ field: "shelf", atLeast: "today" }] }, rows: [{ title: "Earlier", shelf: "yesterday" }], summaryNow: CATALOGUE_NOW - 86_400_000 });
    expect(conditionOf(dated).leftOutSettled).toEqual(["Earlier"]);
    expect(conditionOf(dated).settledKind).toBe("bound");
    const numbered = processingCatalogue({ process: { where: [{ field: "shelf", atLeast: 2, atMost: 4 }] }, rows: [{ title: "Too low", shelf: "1.2" }, { title: "Unknown", shelf: "Unrated" }] });
    expect(conditionOf(numbered).leftOutSettled).toEqual(["Too low"]);
    expect(conditionOf(numbered).settledKind).toBe("bound");
  });

  it("settles presence and negated case-sensitive text with their original evaluator semantics", () => {
    const presence = processingCatalogue({ process: { where: [{ field: "shelf", is: "present" }] }, rows: [{ title: "Missing" }] });
    expect(conditionOf(presence).leftOutSettled).toEqual(["Missing"]);
    expect(conditionOf(presence).settledKind).toBe("presence");
    const negated = processingCatalogue({ process: { where: [{ field: "shelf", matches: "/^Available$/", not: true }] }, rows: [{ title: "Exact", shelf: "Available" }, { title: "Lower", shelf: "available" }] });
    expect(conditionOf(negated).leftOutSettled).toEqual(["Exact"]);
    expect(conditionOf(negated).settledKind).toBe("text");
  });

  it("leaves unsupported mixed conditions and relative windows under their original obligations", () => {
    const mixed = processingCatalogue({ process: { where: [{ field: "shelf", atLeast: 2, contains: "Available" }] } });
    expect(conditionOf(mixed).leftOutSettled).toBeUndefined();
    const window = processingCatalogue({ process: { where: [{ field: "shelf", within: "7 days" }] }, rows: [{ title: "Missing" }] });
    expect(conditionOf(window).leftOutSettled).toBeUndefined();
  });
});
