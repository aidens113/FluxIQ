import { describe, expect, it } from "vitest";
import { generateIamActionCatalog, renderIamActionCatalogModule } from "../index.ts";
import type { IamEndpointRegistration } from "../index.ts";
import { withLfLineEndings } from "./generated-text.ts";

// The drift check's comparison passes in an LF checkout and a CRLF one, and
// still fails on a real change to the content.
const LIST = { programId: "docs", endpoint: "list-documents", permission: "programs.read", classification: "read" };
const DELETE = { programId: "docs", endpoint: "delete-document", permission: "programs.write", classification: "destructive" };

function render(endpoints: IamEndpointRegistration[]): string {
  return renderIamActionCatalogModule(generateIamActionCatalog(endpoints).catalog);
}

function crlf(text: string): string {
  return text.replaceAll("\n", "\r\n");
}

describe("generated file comparison", () => {
  const rendered = render([LIST, DELETE]);

  it("treats an LF and a CRLF checkout of the same file as current", () => {
    expect(rendered).toContain("\n");
    expect(crlf(rendered)).not.toBe(rendered);
    expect(withLfLineEndings(rendered)).toBe(withLfLineEndings(rendered));
    expect(withLfLineEndings(crlf(rendered))).toBe(withLfLineEndings(rendered));
  });

  it("still reports drift in content, in either checkout", () => {
    const drifted = render([LIST]);
    expect(drifted).not.toBe(rendered);
    expect(withLfLineEndings(drifted)).not.toBe(withLfLineEndings(rendered));
    expect(withLfLineEndings(crlf(drifted))).not.toBe(withLfLineEndings(rendered));
    expect(withLfLineEndings(`${rendered}\n`)).not.toBe(withLfLineEndings(rendered));
  });
});
