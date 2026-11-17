// Covers domain-match.ts: which stored project domain a request's domain scope reaches.
import { describe, expect, it } from "vitest";

import { projectDomainMatches } from "../domain-match.ts";

describe("projectDomainMatches", () => {
  it("puts a record or request naming no domain in the instance's domain", () => {
    expect(projectDomainMatches(null, "web", "web")).toBe(true);
    expect(projectDomainMatches(undefined, "web", "web")).toBe(true);
    expect(projectDomainMatches("web", null, "web")).toBe(true);
    expect(projectDomainMatches("web", undefined, "web")).toBe(true);
    expect(projectDomainMatches(null, undefined, "web")).toBe(true);
    expect(projectDomainMatches("web", "web", "web")).toBe(true);
  });

  it("keeps another named domain its own surface", () => {
    expect(projectDomainMatches("other", "web", "web")).toBe(false);
    expect(projectDomainMatches("other", null, "web")).toBe(false);
    expect(projectDomainMatches(null, "other", "web")).toBe(false);
    expect(projectDomainMatches("web", "other", "web")).toBe(false);
  });

  it("changes nothing on an instance that serves no domain", () => {
    expect(projectDomainMatches(null, null, null)).toBe(true);
    expect(projectDomainMatches(undefined, null, null)).toBe(true);
    expect(projectDomainMatches("web", "web", null)).toBe(true);
    expect(projectDomainMatches(null, "web", null)).toBe(false);
    expect(projectDomainMatches("web", null, null)).toBe(false);
  });
});
