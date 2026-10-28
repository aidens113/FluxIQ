// FluxIQ Resource Names: parse and format round-trip every shape the plan
// names, and the parser refuses everything else whole.
import { describe, expect, it } from "vitest";
import { formatFluxIQResourceName, parseFluxIQResourceName, type FluxIQResourceName } from "../index.ts";

const VALID: Array<[string, FluxIQResourceName]> = [
  ["frn:fluxiq:studio:ws-1:project/p1", { service: "studio", workspaceId: "ws-1", resourceType: "project", resourceId: "p1" }],
  ["frn:fluxiq:studio:ws-1:project/p1/flow/f1", { service: "studio", workspaceId: "ws-1", resourceType: "project", resourceId: "p1/flow/f1" }],
  ["frn:fluxiq:studio:ws-1:project/p1/flow/f1/run/r9", { service: "studio", workspaceId: "ws-1", resourceType: "project", resourceId: "p1/flow/f1/run/r9" }],
  ["frn:fluxiq:studio:ws-1:project/p1/recording/rec.2", { service: "studio", workspaceId: "ws-1", resourceType: "project", resourceId: "p1/recording/rec.2" }],
  ["frn:fluxiq:studio:ws-1:project/p1/dataset/d1", { service: "studio", workspaceId: "ws-1", resourceType: "project", resourceId: "p1/dataset/d1" }],
  ["frn:fluxiq:studio:ws-1:schedule/s1", { service: "studio", workspaceId: "ws-1", resourceType: "schedule", resourceId: "s1" }],
  ["frn:fluxiq:secrets:ws-1:key/k1", { service: "secrets", workspaceId: "ws-1", resourceType: "key", resourceId: "k1" }],
  ["frn:fluxiq:gateway:ws-1:browser/cb-7", { service: "gateway", workspaceId: "ws-1", resourceType: "browser", resourceId: "cb-7" }],
  ["frn:fluxiq:iam:ws-1:user/0b5e7c1a-3f9d-4a55-8e2c-9d1f00aa11bb", { service: "iam", workspaceId: "ws-1", resourceType: "user", resourceId: "0b5e7c1a-3f9d-4a55-8e2c-9d1f00aa11bb" }],
  ["frn:fluxiq:iam:ws-1:group/sales", { service: "iam", workspaceId: "ws-1", resourceType: "group", resourceId: "sales" }],
  ["frn:fluxiq:iam:ws-1:role/auditor", { service: "iam", workspaceId: "ws-1", resourceType: "role", resourceId: "auditor" }],
  ["frn:fluxiq:iam::service-identity/website-provisioner", { service: "iam", workspaceId: null, resourceType: "service-identity", resourceId: "website-provisioner" }],
  ["frn:fluxiq:iam::policy/FluxIQUserAccess", { service: "iam", workspaceId: null, resourceType: "policy", resourceId: "FluxIQUserAccess" }],
  ["frn:fluxiq:ops:ws-1:program/database-manager", { service: "ops", workspaceId: "ws-1", resourceType: "program", resourceId: "database-manager" }],
  ["frn:fluxiq:ops::program/deployment-sync", { service: "ops", workspaceId: null, resourceType: "program", resourceId: "deployment-sync" }],
  ["frn:fluxiq:platform::account/u1", { service: "platform", workspaceId: null, resourceType: "account", resourceId: "u1" }],
  ["frn:fluxiq:platform::workspace/ws-1", { service: "platform", workspaceId: null, resourceType: "workspace", resourceId: "ws-1" }]
];

const INVALID = [
  "",
  "arn:aws:iam::123:user/x",
  "frn:fluxiq:studio:ws-1",
  "frn:fluxiq:unknown:ws-1:project/p1",
  "frn:fluxiq:studio::project/p1",
  "frn:fluxiq:platform:ws-1:account/u1",
  "frn:fluxiq:iam::user/u1",
  "frn:fluxiq:studio:ws-1:project",
  "frn:fluxiq:studio:ws-1:project/",
  "frn:fluxiq:studio:ws-1:project/p1/flow",
  "frn:fluxiq:studio:ws-1:project/p1/widget/w1",
  "frn:fluxiq:studio:ws-1:folder/p1",
  "frn:fluxiq:secrets:ws-1:key/k1/flow/f1",
  "frn:fluxiq:studio:ws-1:project/*",
  "frn:fluxiq:studio:ws-1:project/p?",
  "frn:fluxiq:studio:${fluxiq:WorkspaceId}:project/p1",
  "frn:fluxiq:studio:ws 1:project/p1",
  "frn:fluxiq:studio:ws-1:project/p1:extra",
  `frn:fluxiq:studio:ws-1:project/${"a".repeat(129)}`,
  "FRN:fluxiq:studio:ws-1:project/p1"
];

describe("FluxIQ Resource Names", () => {
  it.each(VALID)("parses and formats %s round trip", (text, parsed) => {
    expect(parseFluxIQResourceName(text)).toEqual(parsed);
    expect(formatFluxIQResourceName(parsed)).toBe(text);
    expect(parseFluxIQResourceName(formatFluxIQResourceName(parsed))).toEqual(parsed);
  });

  it.each(INVALID)("refuses %j", (text) => {
    expect(parseFluxIQResourceName(text)).toBeNull();
  });

  it("refuses a non-string", () => {
    expect(parseFluxIQResourceName(42)).toBeNull();
    expect(parseFluxIQResourceName(null)).toBeNull();
  });

  it("refuses to format a name that would not parse back", () => {
    expect(() => formatFluxIQResourceName({ service: "studio", workspaceId: null, resourceType: "project", resourceId: "p1" })).toThrow(TypeError);
    expect(() => formatFluxIQResourceName({ service: "studio", workspaceId: "", resourceType: "project", resourceId: "p1" })).toThrow(TypeError);
    expect(() => formatFluxIQResourceName({ service: "studio", workspaceId: "ws-1", resourceType: "project/p1", resourceId: "flow/f1" })).toThrow(TypeError);
    expect(() => formatFluxIQResourceName({ service: "platform", workspaceId: null, resourceType: "account", resourceId: "u:1" })).toThrow(TypeError);
  });
});
