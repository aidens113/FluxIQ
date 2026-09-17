import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS } from "../../../loop-limits/index.ts";
import {
  AUTOMATION_STUDIO_EXPLORED_EVIDENCE_MAX_ORDINAL,
  automationStudioExploredEvidenceHandle,
  automationStudioExploredEvidenceLabel,
  isAutomationStudioExploredEvidenceLabel,
  packAutomationStudioLlmContext
} from "../index.ts";

// C-7b. The label an explored packet carries, and the qualified handle a
// repair names a control in it with, are written by the recovery's
// exploration, checked by the packet builder, taught to the model by the
// provider and read back by the target check. One definition serves all four.

/** The automation-studio runtime directory, whose `llm/` and `recovery/` are the label's readers and writers. */
const RUNTIME_DIR = fileURLToPath(new URL("../../../", import.meta.url));
const DEFINITION = join(RUNTIME_DIR, "llm", "harness", "explored-evidence-label.ts");
/**
 * The label written out as a literal -- `"explored."`, `explored.2:`, a pattern
 * `explored\.` -- and not a property that happens to be named `explored`, as in
 * `result.explored.length`.
 */
const LABEL_LITERAL = /(?<![.\w])explored\\?\.(?![A-Za-z_])/u;

describe("the explored-packet label", () => {
  it("names the Nth packet an exploration returned, and reads a handle qualified with it back", () => {
    expect(automationStudioExploredEvidenceLabel(1)).toBe("explored.1");
    for (const ordinal of [1, 2, AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS.maxToolCalls, AUTOMATION_STUDIO_EXPLORED_EVIDENCE_MAX_ORDINAL]) {
      const label = automationStudioExploredEvidenceLabel(ordinal);
      expect(isAutomationStudioExploredEvidenceLabel(label), label).toBe(true);
      expect(automationStudioExploredEvidenceHandle(`${label}:target.3`)).toEqual({ kind: "qualified", evidenceId: label, handle: "target.3" });
    }
    // The handle keeps everything after the first colon, as the packet issued it.
    expect(automationStudioExploredEvidenceHandle("explored.2:cell.3:4")).toEqual({ kind: "qualified", evidenceId: "explored.2", handle: "cell.3:4" });
    for (const handle of ["target.3", "explored.0:target.3", "explored:2:target.3", "explored.1000:target.3", "Explored.2:target.3", "explored.2:"]) {
      expect(automationStudioExploredEvidenceHandle(handle), handle).toEqual({ kind: "unqualified", handle });
    }
    for (const ordinal of [0, -1, 1.5, Number.NaN, AUTOMATION_STUDIO_EXPLORED_EVIDENCE_MAX_ORDINAL + 1]) {
      expect(() => automationStudioExploredEvidenceLabel(ordinal), String(ordinal)).toThrow(RangeError);
    }
  });

  it("is the only label the packet builder carries, so every carried label reads back as a qualifier", () => {
    const page: JsonObject = { schemaVersion: "web-llm-evidence.v2", elements: [{ target: "target.1" }] };
    const pack = (evidenceId: string) => packAutomationStudioLlmContext({
      taskKind: "runtime_patch",
      projectId: "project.one",
      flowId: "flow.one",
      instructions: [],
      deniedEvidenceKeys: [],
      explorationEvidence: { maxBytes: 8_000, packets: [{ evidenceId, toolId: "web.recovery.reveal", packet: page }] }
    });
    for (const evidenceId of [automationStudioExploredEvidenceLabel(1), automationStudioExploredEvidenceLabel(64)]) {
      const carried = pack(evidenceId).explorationEvidence?.packets[0]?.evidenceId;
      expect(carried).toBe(evidenceId);
      expect(automationStudioExploredEvidenceHandle(`${carried}:target.1`).kind).toBe("qualified");
    }
    for (const evidenceId of ["explored:1", "explored.0", "explored.01", "explored.1000", "page.1", "Explored.1", ""]) {
      expect(isAutomationStudioExploredEvidenceLabel(evidenceId), evidenceId).toBe(false);
      expect(() => pack(evidenceId), evidenceId).toThrow(/distinct bounded labels/);
    }
  });

  it("can number every packet one exploration is able to return", () => {
    expect(AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS.maxToolCalls).toBeLessThanOrEqual(AUTOMATION_STUDIO_EXPLORED_EVIDENCE_MAX_ORDINAL);
  });

  it("is written in one place, and every other module takes it from there", () => {
    const scanned = sourceFiles(join(RUNTIME_DIR, "llm")).concat(sourceFiles(join(RUNTIME_DIR, "recovery")));
    expect(scanned).toContain(join(RUNTIME_DIR, "recovery", "annotation", "exploration.ts"));
    expect(scanned).toContain(join(RUNTIME_DIR, "llm", "harness", "context-packet.ts"));
    expect(scanned).toContain(DEFINITION);
    for (const file of scanned.filter((path) => path !== DEFINITION)) {
      expect(`${relative(RUNTIME_DIR, file)}: ${codeWithoutComments(file)}`).not.toMatch(LABEL_LITERAL);
    }
    expect(codeWithoutComments(DEFINITION)).toMatch(LABEL_LITERAL);
  });
});

/** Every non-test TypeScript source under `dir`. */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "tests" ? [] : sourceFiles(path);
    return entry.name.endsWith(".ts") ? [path] : [];
  });
}

/** Source with comments removed, so prose that explains the label is not read as a second definition of it. */
function codeWithoutComments(file: string): string {
  return readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//gu, "")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
}
