// The person-text guard, run over what the producers of chat text write in their source: every string
// in the files below, read as the words the person may be shown, passes `internalTermFaults`. The sweeps
// that run a producer (`person-facing-sweep.test.ts`) see only the paths a test drives; this sees every
// literal, so a word like "judged", "trial" or "Core" cannot come back quietly in a branch no test reaches.
//
// Model-facing strings in these files (a tool's `describe`, a model's instruction) are not the person's,
// and are named in `MODEL_FACING` by the property that holds them.

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { internalTermFaults } from "../internal-terms.ts";

const SRC = path.resolve(import.meta.dirname, "../../..");

/** Directories and files whose strings reach the person's chat, status line or page card. */
const PRODUCERS: readonly string[] = [
  "runtime/automation-activity",
  "runtime/conversations/commands",
  "runtime/result-verification/unsettled",
  "runtime/result-verification/check-activity.ts",
  "runtime/result-verification/check-words.ts",
  "framework/automation-service/service/project-build-ending",
  "ui/activity-action",
  "ui/activity-status"
];

/** Properties whose string is for a model: a tool's description, an instruction. Not the person's. */
const MODEL_FACING: ReadonlySet<string> = new Set(["describe", "description", "summary", "instruction", "brief", "guidance"]);

function sources(entry: string): string[] {
  const full = path.join(SRC, entry);
  if (statSync(full).isFile()) return [full];
  return readdirSync(full, { withFileTypes: true }).flatMap((item) => {
    const child = path.join(entry, item.name);
    if (item.isDirectory()) return item.name === "tests" ? [] : sources(child);
    return item.name.endsWith(".ts") ? [path.join(SRC, child)] : [];
  });
}

/**
 * Whether a string reads as a sentence the person may be shown: it holds a space, and is no pattern. A code
 * (`candidate.trial_stale`), a key (`brief`) or a kind (`candidate-draft`) is an identifier, not words.
 */
function isWords(text: string): boolean {
  return /\s/u.test(text.trim()) && !text.startsWith("^");
}

/** Each string the file writes, as `line: text`, leaving out comments and the strings a model reads. */
function literals(file: string): string[] {
  const tree = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
  const found: string[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return;
    if ((ts.isPropertyAssignment(node) || ts.isGetAccessor(node)) && ts.isIdentifier(node.name) && MODEL_FACING.has(node.name.text)) return;
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
      const line = tree.getLineAndCharacterOfPosition(node.getStart()).line + 1;
      found.push(`${line}: ${node.text}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return found;
}

describe("person-facing producers", () => {
  it("write no internal term in any string", () => {
    const offences: string[] = [];
    for (const entry of PRODUCERS) {
      for (const file of sources(entry)) {
        for (const literal of literals(file)) {
          const text = literal.slice(literal.indexOf(": ") + 2);
          const faults = isWords(text) ? internalTermFaults(text) : [];
          if (faults.length) offences.push(`${path.relative(SRC, file)}:${literal.slice(0, 90)} -> ${faults.join(", ")}`);
        }
      }
    }
    expect(offences).toEqual([]);
  });
});
