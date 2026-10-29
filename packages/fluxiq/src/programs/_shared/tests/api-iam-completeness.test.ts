// Every live registration declares its IAM action, access level and resource
// (hosted production plan, Permissions: "a check fails ... on any endpoint
// without an action and resource"). The registry already refuses a declared
// action or level the catalog does not derive; this fails on one left out.

import { describe, expect, it } from "vitest";
import { createGlobalProgramRuntime } from "../runtime.ts";

describe("IAM declarations of the live program registry", () => {
  const endpoints = createGlobalProgramRuntime().api.endpoints();

  it("declares action, accessLevel and resource on every registration", () => {
    const missing = endpoints
      .map((endpoint) => ({ name: `${endpoint.programId}/${endpoint.endpoint}`, lacks: (["action", "accessLevel", "resource"] as const).filter((field) => endpoint[field] === undefined) }))
      .filter((entry) => entry.lacks.length > 0);
    console.info(JSON.stringify({ registrations: endpoints.length, undeclared: missing.length, firstUndeclared: missing.slice(0, 20) }));
    expect(missing, JSON.stringify(missing.slice(0, 40))).toEqual([]);
  });

  it("decides list items only by registered actions, and names operator endpoints by their program", () => {
    const actions = new Set(endpoints.map((endpoint) => endpoint.action).filter((action) => action !== undefined));
    const unknownItemActions = endpoints.filter((endpoint) => endpoint.list?.itemAction !== undefined && !actions.has(endpoint.list.itemAction)).map((endpoint) => `${endpoint.programId}/${endpoint.endpoint}`);
    const operatorElsewhere = endpoints.filter((endpoint) => endpoint.action?.startsWith("ops:") && endpoint.resource !== undefined && endpoint.resource.types.join() !== "program").map((endpoint) => `${endpoint.programId}/${endpoint.endpoint}`);
    expect(unknownItemActions).toEqual([]);
    expect(operatorElsewhere).toEqual([]);
  });
});
