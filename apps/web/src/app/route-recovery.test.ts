import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("App Router recovery contract", () => {
  it("provides root, domain, program, and not-found recovery surfaces", () => {
    for (const file of ["error.tsx", "domains/[domainId]/error.tsx", "programs/[programId]/error.tsx"]) {
      const source = readFileSync(new URL(`./${file}`, import.meta.url), "utf8");
      expect(source).toContain("RouteErrorSurface");
    }
    for (const file of ["loading.tsx", "domains/[domainId]/loading.tsx", "programs/[programId]/loading.tsx"]) {
      expect(readFileSync(new URL(`./${file}`, import.meta.url), "utf8")).toContain('role="status"');
    }
    const notFound = readFileSync(new URL("./not-found.tsx", import.meta.url), "utf8");
    expect(notFound).toContain("Back to Programs");
  });

  it("keeps Retry and safe navigation in the shared error boundary", () => {
    const source = readFileSync(new URL("./RouteErrorSurface.tsx", import.meta.url), "utf8");
    expect(source).toContain("props.reset");
    expect(source).toContain("Error reference");
    expect(source).toContain('href={props.backHref ?? "/"}');
  });
});
