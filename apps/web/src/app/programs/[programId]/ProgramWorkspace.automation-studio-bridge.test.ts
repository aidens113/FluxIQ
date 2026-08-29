import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./ProgramWorkspace.tsx", import.meta.url), "utf8");

describe("ProgramWorkspace Automation Studio boundary", () => {
  it("does not coordinate Automation Studio through global DOM events", () => {
    expect(source).not.toContain("CustomEvent");
    expect(source).not.toContain("automation-studio:");
    expect(source).not.toContain("window.dispatchEvent");
  });

  it("leaves Automation Studio commands to typed inner views", () => {
    expect(source).not.toContain("automation-main-command-bar");
    expect(source).not.toContain("automation-command-center");
    expect(source).toContain('<LiveProgramMain programId={program.id} user={user} />');
  });
});