// The old modes are unchanged, by where this can be reached from alone: only an answer-first
// attempt's ending calls it, and a candidate or project build never reaches that ending.
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ANSWER_FIRST = path.resolve(HERE, "../..");
const AUTOMATION_SERVICE = path.resolve(ANSWER_FIRST, "../..");

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === "tests" ? [] : await sourceFiles(full);
    return entry.name.endsWith(".ts") ? [full] : [];
  }));
  return nested.flat();
}

describe("who reaches a proven Flow's apply", () => {
  it("only the attempt's ending, and the service reaches that only on the answer-first path", async () => {
    // Read every file at once: one after another, the ~800 reads ran past the test's time under load (t885).
    const files = (await sourceFiles(AUTOMATION_SERVICE)).filter((file) => !file.startsWith(path.join(ANSWER_FIRST, "apply-proven")));
    const texts = await Promise.all(files.map((file) => readFile(file, "utf8")));
    const callers = files.filter((_, index) => texts[index]!.includes("automationStudioAnswerFirstApplyProven")).map((file) => path.relative(ANSWER_FIRST, file).split(path.sep).join("/"));
    expect(callers).toEqual(["attempt/ending.ts"]);
    const service = await readFile(path.join(AUTOMATION_SERVICE, "service.ts"), "utf8");
    expect(service.match(/runAutomationStudioAnswerFirstAttempt\(/gu)).toHaveLength(1);
    expect(service).toMatch(/if \(authoringMode === "answer-first"\) return await \(await import\("\.\/service\/answer-first\/index\.ts"\)\)\.runAutomationStudioAnswerFirstAttempt\(/u);
  });
});
