import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProgramLauncher } from "./ProgramLauncher";

const program = {
  id: "automation-studio",
  title: "Automation Studio",
  description: "Build and run deterministic automation.",
  category: "Authoring",
  route: "/programs/automation-studio",
  icon: "blocks" as const,
  status: "available" as const,
  scope: "global" as const,
  globalProgram: true
};

describe("ProgramLauncher", () => {
  it("renders compact searchable rows for domains and programs", () => {
    const html = renderToStaticMarkup(<ProgramLauncher domains={[{
      id: "web",
      title: "Web",
      description: "Browser automation",
      category: "Domain",
      route: "/domains/web",
      status: "available",
      icon: "mouse-pointer-click"
    }]} label="Programs" programs={[program]} />);
    expect(html).toContain('type="search"');
    expect(html).toContain('placeholder="Search programs and domains"');
    expect(html).toContain('class="launcher-row"');
    expect(html).toContain("Automation Studio");
    expect(html).toContain("Web");
    expect(html).not.toContain("program-card");
  });

  it("distinguishes a loaded empty directory", () => {
    const html = renderToStaticMarkup(<ProgramLauncher label="Programs" programs={[]} />);
    expect(html).toContain("No matching programs");
    expect(html).toContain("Try a different name");
  });
});