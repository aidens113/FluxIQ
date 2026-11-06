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
