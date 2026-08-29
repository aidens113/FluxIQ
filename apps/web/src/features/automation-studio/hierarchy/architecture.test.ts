import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const implementationFiles = [
  "ProjectTree.tsx",
  "bounded-rows.ts",
  "capabilities.ts",
  "commands.ts",
  "contracts.ts",
  "controller.ts",
  "dialog-transaction.ts",
  "flow-generation.ts",
  "generation.ts",
  "identifiers.ts",
  "indexing.ts",
  "keyboard.ts",
  "model.ts",
  "paged-cache.ts",
  "recording-generation.ts",
  "routing.ts",
  "selectors.ts",
  "signature.ts",
  "store.ts",
  "tree-icons.ts",
  "tree-rows.tsx"
] as const;

describe("hierarchy package architecture", () => {
  it("keeps implementation modules bounded and model.ts as compatibility exports", () => {
    for (const file of implementationFiles) {
      const source = readFileSync(fileURLToPath(new URL("./" + file, import.meta.url)), "utf8");
      expect(source.split(/\r?\n/).length, file).toBeLessThanOrEqual(300);
    }
    const model = readFileSync(fileURLToPath(new URL("./model.ts", import.meta.url)), "utf8");
    expect(model).not.toContain("function ");
    expect(model).not.toContain("type AutomationHierarchyNode =");
  });

  it("keeps tree timing, dialog state, and routing outside the row renderer", () => {
    const rows = readFileSync(fileURLToPath(new URL("./tree-rows.tsx", import.meta.url)), "utf8");
    expect(rows).not.toContain("setTimeout");
    expect(rows).not.toContain("useEffect");
    expect(rows).not.toContain("AutomationHierarchyDialogTransaction");
    expect(rows).not.toContain("automationHierarchySelectionForOpenNode");
  });
});