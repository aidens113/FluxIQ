// Covers person-domain-scope.ts: the domain a signed-in person's program call works in.
import { describe, expect, it } from "vitest";

import { personDomainScope } from "../person-domain-scope.ts";

const at = (programId: string, query = "") => `http://127.0.0.1/api/programs/${programId}/projects${query}`;

describe("personDomainScope", () => {
  it("puts an Automation Studio call naming no domain in the instance's", () => {
    expect(personDomainScope(at("automation-studio"), "automation-studio", "web")).toEqual({ domainId: "web" });
    expect(personDomainScope(at("Automation-Studio"), " Automation-Studio ", "web")).toEqual({ domainId: "web" });
  });

  it("keeps the domain the URL names", () => {
    expect(personDomainScope(at("automation-studio", "?domainId=other"), "automation-studio", "web")).toEqual({ domainId: "other" });
  });

  it("leaves other programs, which key their own stores by the scope, where the URL puts them", () => {
    expect(personDomainScope(at("database-manager"), "database-manager", "web")).toEqual({ domainId: null });
    expect(personDomainScope(at("production-runner", "?domainId=web"), "production-runner", "web")).toEqual({ domainId: "web" });
  });

  it("changes nothing on an instance that serves no domain", () => {
    expect(personDomainScope(at("automation-studio"), "automation-studio", null)).toEqual({ domainId: null });
    expect(personDomainScope(at("automation-studio"), "automation-studio", undefined)).toEqual({ domainId: null });
  });
});
