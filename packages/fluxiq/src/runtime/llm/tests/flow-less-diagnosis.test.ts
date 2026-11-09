// The judge of an attempt with no Flow is told nothing of a Flow's shape or steps, and every other
// verification is told exactly what it always was (t861). The digests are of the text as it stood
// before the branch: an edit to a judge's words is a decision, and this makes it a visible one.
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { automationStudioDiagnosisPromptInstruction } from "../diagnosis-instructions.ts";

const digest = (text: string): string => createHash("sha256").update(text).digest("hex");

describe("the Flow-less branch of a verification's instruction", () => {
  it("says nothing of a Flow, its steps or a test, and keeps the fields and the order", () => {
    const said = automationStudioDiagnosisPromptInstruction("loop_verification", { flowLess: true });
    expect(said).not.toMatch(/flowShape|buildTest|\bFlow\b|\bsteps?\b|\btrial\b/u);
    expect(said).toContain("answersRequest");
    expect(said).toContain("Your verdict is read from the diagnosis");
    expect(said).toContain("answerText the model's own words");
  });

  it("wins over a build test's words, which no attempt has", () => {
    expect(automationStudioDiagnosisPromptInstruction("loop_verification", { flowLess: true, buildTest: true })).toBe(automationStudioDiagnosisPromptInstruction("loop_verification", { flowLess: true }));
  });

  it("leaves every other call's text byte for byte", () => {
    expect(digest(automationStudioDiagnosisPromptInstruction("loop_verification"))).toBe("3b1f0faccbed038f4142da2400aa7688e3f806abdffbcf1308117744b6224cfe");
    expect(digest(automationStudioDiagnosisPromptInstruction("loop_verification", { buildTest: true }))).toBe("79d66e75bd2422f2c66fd87570c916fed4f06908368e97be4961526e38c9bd15");
    expect(digest(automationStudioDiagnosisPromptInstruction("runtime_diagnosis"))).toBe("e7b43626fd5b1a784513f5dfd9bf3e4884160a553736ca8f1b9536b5dc63e39b");
    expect(automationStudioDiagnosisPromptInstruction("runtime_diagnosis", { flowLess: true })).toBe(automationStudioDiagnosisPromptInstruction("runtime_diagnosis"));
  });
});

// t875: a yes over rows stands on them, and a number beside a page number is not a page count by itself.
describe("what the Flow-less judge is told of a yes on rows (t875)", () => {
  const said = automationStudioDiagnosisPromptInstruction("loop_verification", { flowLess: true });

  it("asks a yes over rows to cite them and say how many records the site shows that answer the request, and how an empty answer is said", () => {
    expect(said).toContain("A yes over rows stands on the rows themselves: cite in diagnosis.checked each stored row that answers the request");
    expect(said).toContain("diagnosis.answerRecords whether the request asks for records as its answer (asked)");
    expect(said).toContain("how many records the site shows that answer it (siteShows)");
    expect(said).toContain("a yes with asked true and siteShows 0 over no rows");
  });

  it("never reads a number beside a page number as a count of pages by itself", () => {
    expect(said).toContain("A number shown beside a page number may count results rather than pages");
    expect(said).toContain("never from such a number alone");
  });

  // The words the realistic scenarios use (`../../result-verification/flow-less/tests/judge.test.ts`), held to the new sentences.
  it("names no realistic scenario's site or task", () => {
    const added = said.slice(said.indexOf("A yes over rows stands"));
    expect(added.length).toBeGreaterThan(100);
    const WORDS = /\bstores?\b|shop|marketplace|retail|classified|auction|photo|social|network|feed|company|website|professional|product|seller|listing|follow|profile|resume|vacanc|apply|friend|basket|cart\b|towel|watchlist|bid\b|coupon|connection|invitation|saved item|giveaway|quote|job|role|digest|rating|colour|size\b|quantity/iu;
    expect(added.match(WORDS)?.[0]).toBeUndefined();
  });
});
