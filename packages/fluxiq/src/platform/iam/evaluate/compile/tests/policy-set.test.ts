// The evaluator's vector table: one row per rule of AWS IAM evaluation as the
// hosted plan's Permissions section adopts it -- precedence across identity,
// guardrail, session and boundary policies; wildcards; NotAction and
// NotResource; policy variables; and every condition operator and key.
import { describe, expect, it } from "vitest";
import type { IamPolicy, IamPolicySet, IamPrincipal, IamRequestContext, IamResource, IamResourceDecision } from "../../../types.ts";
import { compileIamPolicySet } from "../../index.ts";
import { testContext, testPolicy, testPolicySet, testPrincipal } from "../../tests/iam-test-policy.ts";

const PROJECT = "frn:fluxiq:studio:ws1:project/p1";
const FLOW = "frn:fluxiq:studio:ws1:project/p1/flow/f1";
const KEY = "frn:fluxiq:secrets:ws1:key/k1";
const OTHER_PROJECT = "frn:fluxiq:studio:ws2:project/p1";
const ALICE = "frn:fluxiq:iam:ws1:user/alice";
const BOB = "frn:fluxiq:iam:ws1:user/bob";
const CREATE = "studio:CreateProject";
const READ = "studio:ReadProject";

type Expected = Pick<IamResourceDecision, "decision" | "reason" | "matched">;

type Vector = {
  name: string;
  set: IamPolicySet;
  action?: string;
  resource?: IamResource;
  principal?: IamPrincipal;
  workspaceId?: string | null;
  context?: IamRequestContext;
  expected: Expected;
};

const IMPLICIT: Expected = { decision: "deny", reason: "implicit-deny", matched: "implicit" };

function allowed(policy: string, sid: string | null): Expected {
  return { decision: "allow", reason: "allowed", matched: { policy, sid } };
}

function denied(policy: string, sid: string | null): Expected {
  return { decision: "deny", reason: "explicit-deny", matched: { policy, sid } };
}

function identity(name: string, statements: readonly unknown[]): IamPolicy {
  return testPolicy(name, "identity", statements);
}

function allowOn(sid: string, action: string | string[], resource: string | string[], condition?: unknown): unknown {
  return condition === undefined ? { Sid: sid, Effect: "Allow", Action: action, Resource: resource } : { Sid: sid, Effect: "Allow", Action: action, Resource: resource, Condition: condition };
}

function denyOn(sid: string, action: string | string[], resource: string | string[], condition?: unknown): unknown {
  return condition === undefined ? { Sid: sid, Effect: "Deny", Action: action, Resource: resource } : { Sid: sid, Effect: "Deny", Action: action, Resource: resource, Condition: condition };
}

// An identity policy allowing `action` on `resource` only when `condition` holds.
function conditional(condition: unknown, action = CREATE, resource = PROJECT): IamPolicySet {
  return testPolicySet({ identity: [identity("Cond", [allowOn("C", action, resource, condition)])] });
}

const ALLOW_ALL = identity("All", [allowOn("All", "*", "*")]);
const ALLOW_CREATE = identity("Create", [allowOn("Create", CREATE, PROJECT)]);

const precedence: Vector[] = [
  { name: "an exact Allow allows", set: testPolicySet({ identity: [ALLOW_CREATE] }), expected: allowed("Create", "Create") },
  { name: "no statement for the action is an implicit deny", set: testPolicySet({ identity: [ALLOW_CREATE] }), action: READ, expected: IMPLICIT },
  { name: "no policies at all is an implicit deny", set: testPolicySet({}), expected: IMPLICIT },
  { name: "a Deny beats an Allow in the same policy", set: testPolicySet({ identity: [identity("Mixed", [allowOn("Yes", "*", "*"), denyOn("No", CREATE, PROJECT)])] }), expected: denied("Mixed", "No") },
  { name: "a Deny in another identity policy beats an Allow", set: testPolicySet({ identity: [ALLOW_ALL, identity("NoCreate", [denyOn("No", "studio:Create*", "*")])] }), expected: denied("NoCreate", "No") },
  { name: "a guardrail Deny beats an identity Allow", set: testPolicySet({ identity: [ALLOW_ALL], guardrails: [testPolicy("Guard", "guardrail", [denyOn("G", "studio:*", PROJECT)])] }), expected: denied("Guard", "G") },
  { name: "a session Deny beats an identity Allow", set: testPolicySet({ identity: [ALLOW_ALL], sessions: [testPolicy("Sess", "session", [allowOn("S", "*", "*"), denyOn("SD", CREATE, "*")])] }), expected: denied("Sess", "SD") },
  { name: "a boundary Deny beats an identity Allow", set: testPolicySet({ identity: [ALLOW_ALL], boundary: testPolicy("Bound", "boundary", [allowOn("B", "*", "*"), denyOn("BD", CREATE, "*")]) }), expected: denied("Bound", "BD") },
  { name: "the first Deny in identity, guardrail, session, boundary order is cited", set: testPolicySet({ identity: [ALLOW_ALL], guardrails: [testPolicy("Guard", "guardrail", [denyOn("G", "*", "*")])], boundary: testPolicy("Bound", "boundary", [denyOn("BD", "*", "*")]) }), expected: denied("Guard", "G") },
  { name: "a session policy that does not allow narrows to an implicit deny", set: testPolicySet({ identity: [ALLOW_ALL], sessions: [testPolicy("Sess", "session", [allowOn("S", READ, "*")])] }), expected: IMPLICIT },
  { name: "identity and session both allowing allows, citing identity", set: testPolicySet({ identity: [ALLOW_CREATE], sessions: [testPolicy("Sess", "session", [allowOn("S", "studio:*", "*")])] }), expected: allowed("Create", "Create") },
  { name: "every session policy must allow", set: testPolicySet({ identity: [ALLOW_ALL], sessions: [testPolicy("S1", "session", [allowOn("S", "*", "*")]), testPolicy("S2", "session", [allowOn("S", READ, "*")])] }), expected: IMPLICIT },
  { name: "a boundary that does not allow narrows to an implicit deny", set: testPolicySet({ identity: [ALLOW_ALL], boundary: testPolicy("Bound", "boundary", [allowOn("B", READ, "*")]) }), expected: IMPLICIT },
  { name: "identity and boundary both allowing allows", set: testPolicySet({ identity: [ALLOW_CREATE], boundary: testPolicy("Bound", "boundary", [allowOn("B", "studio:*", "*")]) }), expected: allowed("Create", "Create") },
  { name: "a boundary alone never grants", set: testPolicySet({ identity: [], boundary: testPolicy("Bound", "boundary", [allowOn("B", "*", "*")]) }), expected: IMPLICIT },
  { name: "a session policy alone never grants", set: testPolicySet({ identity: [], sessions: [testPolicy("Sess", "session", [allowOn("S", "*", "*")])] }), expected: IMPLICIT },
  { name: "a guardrail whose Deny does not match leaves the Allow", set: testPolicySet({ identity: [ALLOW_CREATE], guardrails: [testPolicy("Guard", "guardrail", [denyOn("G", "secrets:*", "*")])] }), expected: allowed("Create", "Create") },
  { name: "a Deny whose condition fails does not deny", set: testPolicySet({ identity: [ALLOW_CREATE, identity("NoApi", [denyOn("D", "*", "*", { StringEquals: { "fluxiq:RequestOrigin": "api" } })])] }), expected: allowed("Create", "Create") },
  { name: "a statement without Sid is cited with a null sid", set: testPolicySet({ identity: [identity("Anon", [{ Effect: "Allow", Action: CREATE, Resource: PROJECT }])] }), expected: allowed("Anon", null) },
  { name: "the first identity statement that allows is cited", set: testPolicySet({ identity: [identity("Two", [allowOn("Narrow", CREATE, PROJECT), allowOn("Wide", "studio:*", "*")])] }), expected: allowed("Two", "Narrow") },
  { name: "the full-access fast path cites the full-access grant", set: testPolicySet({ identity: [identity("Two", [allowOn("Narrow", CREATE, PROJECT), allowOn("Wide", "*", "*")])] }), expected: allowed("Two", "Wide") }
];

const wildcards: Vector[] = [
  { name: "an action * in the name matches", set: testPolicySet({ identity: [identity("W", [allowOn("W", "studio:*", PROJECT)])] }), expected: allowed("W", "W") },
  { name: "a prefix wildcard does not match another action", set: testPolicySet({ identity: [identity("W", [allowOn("W", "studio:Read*", PROJECT)])] }), expected: IMPLICIT },
  { name: "an action ? matches one character", set: testPolicySet({ identity: [identity("W", [allowOn("W", "secrets:UseKe?", KEY)])] }), action: "secrets:UseKey", resource: { frn: KEY }, expected: allowed("W", "W") },
  { name: "an action ? never matches two characters", set: testPolicySet({ identity: [identity("W", [allowOn("W", "secrets:UseK?", KEY)])] }), action: "secrets:UseKey", resource: { frn: KEY }, expected: IMPLICIT },
  { name: "actions compare case-insensitively", set: testPolicySet({ identity: [identity("W", [allowOn("W", "studio:createproject", PROJECT)])] }), expected: allowed("W", "W") },
  { name: "an action list matches any entry", set: testPolicySet({ identity: [identity("W", [allowOn("W", [READ, CREATE], PROJECT)])] }), expected: allowed("W", "W") },
  { name: "a resource * crosses /", set: testPolicySet({ identity: [identity("W", [allowOn("W", "*", "frn:fluxiq:studio:ws1:project/*")])] }), resource: { frn: FLOW }, expected: allowed("W", "W") },
  { name: "a resource * crosses :", set: testPolicySet({ identity: [identity("W", [allowOn("W", "*", "frn:fluxiq:*:ws1:*")])] }), action: "secrets:UseKey", resource: { frn: KEY }, expected: allowed("W", "W") },
  { name: "a resource * may match an empty run", set: testPolicySet({ identity: [identity("W", [allowOn("W", "*", "frn:fluxiq:studio:ws1:project/p1*")])] }), expected: allowed("W", "W") },
  { name: "resources compare case-sensitively", set: testPolicySet({ identity: [identity("W", [allowOn("W", "*", "frn:fluxiq:studio:ws1:project/P1")])] }), expected: IMPLICIT },
  { name: "a resource ? matches one character", set: testPolicySet({ identity: [identity("W", [allowOn("W", "*", "frn:fluxiq:studio:ws1:project/p?")])] }), expected: allowed("W", "W") },
  { name: "a resource ? never matches two characters", set: testPolicySet({ identity: [identity("W", [allowOn("W", "*", "frn:fluxiq:studio:ws1:project/p?")])] }), resource: { frn: "frn:fluxiq:studio:ws1:project/p12" }, expected: IMPLICIT },
  { name: "a . in a pattern is literal", set: testPolicySet({ identity: [identity("W", [allowOn("W", "*", "frn:fluxiq:studio:ws1:project/a.b")])] }), resource: { frn: "frn:fluxiq:studio:ws1:project/aXb" }, expected: IMPLICIT },
  { name: "a + in a pattern is literal", set: testPolicySet({ identity: [identity("W", [allowOn("W", "*", "frn:fluxiq:studio:ws1:project/a+b")])] }), resource: { frn: "frn:fluxiq:studio:ws1:project/aab" }, expected: IMPLICIT },
  { name: "a resource pattern is anchored at both ends", set: testPolicySet({ identity: [identity("W", [allowOn("W", "*", "frn:fluxiq:studio:ws1:project/p1")])] }), resource: { frn: FLOW }, expected: IMPLICIT },
  { name: "a resource list matches any entry", set: testPolicySet({ identity: [identity("W", [allowOn("W", "*", [KEY, PROJECT])])] }), expected: allowed("W", "W") }
];

const negations: Vector[] = [
  { name: "Allow NotAction allows an action outside it", set: testPolicySet({ identity: [identity("N", [{ Sid: "N", Effect: "Allow", NotAction: "iam:*", Resource: "*" }])] }), expected: allowed("N", "N") },
  { name: "Allow NotAction never allows an action inside it", set: testPolicySet({ identity: [identity("N", [{ Sid: "N", Effect: "Allow", NotAction: "iam:*", Resource: "*" }])] }), action: "iam:CreateUser", resource: { frn: BOB }, expected: IMPLICIT },
  { name: "Deny NotAction denies an action outside it", set: testPolicySet({ identity: [ALLOW_ALL, identity("ReadOnly", [{ Sid: "D", Effect: "Deny", NotAction: "studio:Read*", Resource: "*" }])] }), expected: denied("ReadOnly", "D") },
  { name: "Deny NotAction leaves an action inside it", set: testPolicySet({ identity: [ALLOW_ALL, identity("ReadOnly", [{ Sid: "D", Effect: "Deny", NotAction: "studio:Read*", Resource: "*" }])] }), action: READ, expected: allowed("All", "All") },
  { name: "Allow NotResource allows a resource outside it", set: testPolicySet({ identity: [identity("N", [{ Sid: "N", Effect: "Allow", Action: "*", NotResource: "frn:fluxiq:secrets:*:*" }])] }), expected: allowed("N", "N") },
  { name: "Allow NotResource never allows a resource inside it", set: testPolicySet({ identity: [identity("N", [{ Sid: "N", Effect: "Allow", Action: "*", NotResource: "frn:fluxiq:secrets:*:*" }])] }), action: "secrets:UseKey", resource: { frn: KEY }, expected: IMPLICIT },
  { name: "Deny NotResource denies outside the workspace", set: testPolicySet({ identity: [ALLOW_ALL, identity("Fence", [{ Sid: "F", Effect: "Deny", Action: "*", NotResource: "frn:fluxiq:*:${fluxiq:WorkspaceId}:*" }])] }), resource: { frn: OTHER_PROJECT }, expected: denied("Fence", "F") },
  { name: "Deny NotResource leaves the workspace", set: testPolicySet({ identity: [ALLOW_ALL, identity("Fence", [{ Sid: "F", Effect: "Deny", Action: "*", NotResource: "frn:fluxiq:*:${fluxiq:WorkspaceId}:*" }])] }), expected: allowed("All", "All") }
];

const SELF = "frn:fluxiq:iam:${fluxiq:WorkspaceId}:user/${fluxiq:PrincipalId}";
const platformService = testPrincipal({ type: "service-identity", id: "sync", workspaceId: null, frn: "frn:fluxiq:iam::service-identity/sync" });

const variables: Vector[] = [
  { name: "variables bind to the principal and workspace", set: testPolicySet({ identity: [identity("Self", [allowOn("Self", "iam:*", SELF)])] }), action: "iam:ReadUser", resource: { frn: ALICE }, expected: allowed("Self", "Self") },
  { name: "a bound pattern does not match another principal", set: testPolicySet({ identity: [identity("Self", [allowOn("Self", "iam:*", SELF)])] }), action: "iam:ReadUser", resource: { frn: BOB }, expected: IMPLICIT },
  { name: "a pattern needing an unbound workspace matches nothing", set: testPolicySet({ identity: [identity("Ws", [allowOn("Ws", "*", "frn:fluxiq:*:${fluxiq:WorkspaceId}:*")])] }), principal: platformService, workspaceId: null, context: testContext({ workspaceId: null }), expected: IMPLICIT },
  { name: "a NotResource needing an unbound workspace excludes nothing", set: testPolicySet({ identity: [ALLOW_ALL, identity("Fence", [{ Sid: "F", Effect: "Deny", Action: "*", NotResource: "frn:fluxiq:*:${fluxiq:WorkspaceId}:*" }])] }), principal: platformService, workspaceId: null, context: testContext({ workspaceId: null }), expected: denied("Fence", "F") },
  { name: "a bound value's . is literal", set: testPolicySet({ identity: [identity("Self", [allowOn("Self", "iam:*", SELF)])] }), principal: testPrincipal({ id: "a.b" }), action: "iam:ReadUser", resource: { frn: "frn:fluxiq:iam:ws1:user/aXb" }, expected: IMPLICIT },
  { name: "a bound value with regex characters matches itself", set: testPolicySet({ identity: [identity("Self", [allowOn("Self", "iam:*", SELF)])] }), principal: testPrincipal({ id: "a+b.c" }), action: "iam:ReadUser", resource: { frn: "frn:fluxiq:iam:ws1:user/a+b.c" }, expected: allowed("Self", "Self") },
  { name: "the compile workspace binds, not the principal's", set: testPolicySet({ identity: [identity("Ws", [allowOn("Ws", "*", "frn:fluxiq:studio:${fluxiq:WorkspaceId}:*")])] }), workspaceId: "ws2", resource: { frn: OTHER_PROJECT }, expected: allowed("Ws", "Ws") },
  { name: "a condition value variable binds", set: conditional({ StringEquals: { "fluxiq:ResourceOwner": "${fluxiq:PrincipalId}" } }), resource: { frn: PROJECT, ownerId: "alice" }, expected: allowed("Cond", "C") },
  { name: "a bound condition value does not match another owner", set: conditional({ StringEquals: { "fluxiq:ResourceOwner": "${fluxiq:PrincipalId}" } }), resource: { frn: PROJECT, ownerId: "bob" }, expected: IMPLICIT },
  { name: "a condition value needing an unbound variable matches nothing", set: conditional({ StringEquals: { "fluxiq:WorkspaceId": "${fluxiq:WorkspaceId}" } }, "*", "*"), principal: platformService, workspaceId: null, expected: IMPLICIT }
];

const conditions: Vector[] = [
  { name: "StringEquals matches", set: conditional({ StringEquals: { "fluxiq:RequestOrigin": "panel" } }), expected: allowed("Cond", "C") },
  { name: "StringEquals fails on another value", set: conditional({ StringEquals: { "fluxiq:RequestOrigin": "panel" } }), context: testContext({ origin: "api" }), expected: IMPLICIT },
  { name: "a key's values are ORed", set: conditional({ StringEquals: { "fluxiq:RequestOrigin": ["panel", "api"] } }), context: testContext({ origin: "api" }), expected: allowed("Cond", "C") },
  { name: "keys under one operator are ANDed", set: conditional({ StringEquals: { "fluxiq:RequestOrigin": "panel", "fluxiq:PrincipalType": "user" } }), principal: testPrincipal({ type: "role", id: "Deployer" }), expected: IMPLICIT },
  { name: "operators are ANDed", set: conditional({ StringEquals: { "fluxiq:RequestOrigin": "panel" }, Bool: { "fluxiq:MfaPresent": true } }), context: testContext({ mfaPresent: false }), expected: IMPLICIT },
  { name: "StringEquals is case-sensitive", set: conditional({ StringEquals: { "fluxiq:RequestOrigin": "Panel" } }), expected: IMPLICIT },
  { name: "StringNotEquals passes on another value", set: conditional({ StringNotEquals: { "fluxiq:RequestOrigin": "schedule" } }), expected: allowed("Cond", "C") },
  { name: "StringNotEquals fails when any value matches", set: conditional({ StringNotEquals: { "fluxiq:RequestOrigin": ["schedule", "api"] } }), context: testContext({ origin: "api" }), expected: IMPLICIT },
  { name: "StringNotEquals passes on a missing key (AWS)", set: conditional({ StringNotEquals: { "fluxiq:ConnectedBrowserId": "c1" } }), expected: allowed("Cond", "C") },
  { name: "StringEquals fails on a missing key", set: conditional({ StringEquals: { "fluxiq:ConnectedBrowserId": "c1" } }), expected: IMPLICIT },
  { name: "StringEqualsIfExists passes on a missing key", set: conditional({ StringEqualsIfExists: { "fluxiq:ConnectedBrowserId": "c1" } }), expected: allowed("Cond", "C") },
  { name: "StringEqualsIfExists still compares a present key", set: conditional({ StringEqualsIfExists: { "fluxiq:ConnectedBrowserId": "c1" } }), context: testContext({ connectedClientId: "c2" }), expected: IMPLICIT },
  { name: "ConnectedBrowserId reads connectedClientId", set: conditional({ StringEquals: { "fluxiq:ConnectedBrowserId": "c1" } }), context: testContext({ connectedClientId: "c1" }), expected: allowed("Cond", "C") },
  { name: "StringLike matches a resource tag", set: conditional({ StringLike: { "fluxiq:ResourceTag/team": "eng-*" } }), resource: { frn: PROJECT, tags: { team: "eng-core" } }, expected: allowed("Cond", "C") },
  { name: "StringLike fails on another tag value", set: conditional({ StringLike: { "fluxiq:ResourceTag/team": "eng-*" } }), resource: { frn: PROJECT, tags: { team: "ops" } }, expected: IMPLICIT },
  { name: "a missing resource tag fails", set: conditional({ StringLike: { "fluxiq:ResourceTag/team": "*" } }), resource: { frn: PROJECT, tags: {} }, expected: IMPLICIT },
  { name: "an inherited property is not a tag", set: conditional({ StringLike: { "fluxiq:ResourceTag/constructor": "*" } }), resource: { frn: PROJECT, tags: {} }, expected: IMPLICIT },
  { name: "a null owner is a missing key", set: conditional({ StringEquals: { "fluxiq:ResourceOwner": "${fluxiq:PrincipalId}" } }), resource: { frn: PROJECT, ownerId: null }, expected: IMPLICIT },
  { name: "PrincipalId reads the principal", set: conditional({ StringEquals: { "fluxiq:PrincipalId": "alice" } }), expected: allowed("Cond", "C") },
  { name: "WorkspaceId reads the request context", set: conditional({ StringEquals: { "fluxiq:WorkspaceId": "ws1" } }), expected: allowed("Cond", "C") },
  { name: "a null context workspace is a missing key", set: conditional({ StringEquals: { "fluxiq:WorkspaceId": "ws1" } }), context: testContext({ workspaceId: null }), expected: IMPLICIT },
  { name: "Profile reads the request context", set: conditional({ StringEquals: { "fluxiq:Profile": "service" } }), context: testContext({ profile: "service" }), expected: allowed("Cond", "C") },
  { name: "Bool accepts the string true", set: conditional({ Bool: { "fluxiq:MfaPresent": "true" } }), context: testContext({ mfaPresent: true }), expected: allowed("Cond", "C") },
  { name: "Bool fails on a missing key", set: conditional({ Bool: { "fluxiq:MfaPresent": true } }), expected: IMPLICIT },
  { name: "Bool false matches false", set: conditional({ Bool: { "fluxiq:MfaPresent": false } }), context: testContext({ mfaPresent: false }), expected: allowed("Cond", "C") },
  { name: "Bool false fails on a missing key", set: conditional({ Bool: { "fluxiq:MfaPresent": "false" } }), expected: IMPLICIT },
  { name: "IpAddress matches an IPv4 block", set: conditional({ IpAddress: { "fluxiq:SourceIp": "10.0.0.0/8" } }), context: testContext({ sourceIp: "10.1.2.3" }), expected: allowed("Cond", "C") },
  { name: "IpAddress fails outside the block", set: conditional({ IpAddress: { "fluxiq:SourceIp": "10.0.0.0/8" } }), context: testContext({ sourceIp: "11.0.0.1" }), expected: IMPLICIT },
  { name: "IpAddress matches an exact address", set: conditional({ IpAddress: { "fluxiq:SourceIp": "192.168.1.7" } }), context: testContext({ sourceIp: "192.168.1.7" }), expected: allowed("Cond", "C") },
  { name: "IpAddress matches an IPv6 block", set: conditional({ IpAddress: { "fluxiq:SourceIp": "2001:db8::/32" } }), context: testContext({ sourceIp: "2001:db8:0:1::5" }), expected: allowed("Cond", "C") },
  { name: "IpAddress never matches across families", set: conditional({ IpAddress: { "fluxiq:SourceIp": "2001:db8::/32" } }), context: testContext({ sourceIp: "10.0.0.1" }), expected: IMPLICIT },
  { name: "an IPv4-mapped address compares as IPv4", set: conditional({ IpAddress: { "fluxiq:SourceIp": "10.0.0.0/8" } }), context: testContext({ sourceIp: "::ffff:10.0.0.7" }), expected: allowed("Cond", "C") },
  { name: "IpAddress fails on a missing address", set: conditional({ IpAddress: { "fluxiq:SourceIp": "0.0.0.0/0" } }), expected: IMPLICIT },
  { name: "Deny NotIpAddress denies outside the block", set: testPolicySet({ identity: [ALLOW_ALL, identity("Office", [denyOn("D", "*", "*", { NotIpAddress: { "fluxiq:SourceIp": "10.0.0.0/8" } })])] }), context: testContext({ sourceIp: "192.168.1.1" }), expected: denied("Office", "D") },
  { name: "Deny NotIpAddress leaves an address inside the block", set: testPolicySet({ identity: [ALLOW_ALL, identity("Office", [denyOn("D", "*", "*", { NotIpAddress: { "fluxiq:SourceIp": "10.0.0.0/8" } })])] }), context: testContext({ sourceIp: "10.9.9.9" }), expected: allowed("All", "All") },
  { name: "Deny NotIpAddress denies a request with no address (AWS)", set: testPolicySet({ identity: [ALLOW_ALL, identity("Office", [denyOn("D", "*", "*", { NotIpAddress: { "fluxiq:SourceIp": "10.0.0.0/8" } })])] }), expected: denied("Office", "D") },
  { name: "an unparseable address is inside no block", set: conditional({ IpAddress: { "fluxiq:SourceIp": "0.0.0.0/0" } }), context: testContext({ sourceIp: "not-an-ip" }), expected: IMPLICIT },
  { name: "DateLessThan passes before the instant", set: conditional({ DateLessThan: { "fluxiq:CurrentTime": "2026-12-31T00:00:00Z" } }), expected: allowed("Cond", "C") },
  { name: "DateLessThan fails after the instant", set: conditional({ DateLessThan: { "fluxiq:CurrentTime": "2026-01-01" } }), expected: IMPLICIT },
  { name: "DateGreaterThan passes after the instant", set: conditional({ DateGreaterThan: { "fluxiq:CurrentTime": "2026-10-28T11:00:00Z" } }), expected: allowed("Cond", "C") },
  { name: "DateGreaterThan is strict", set: conditional({ DateGreaterThan: { "fluxiq:CurrentTime": "2026-10-28T12:00:00Z" } }), expected: IMPLICIT },
  { name: "dates compare across offsets", set: conditional({ DateLessThan: { "fluxiq:CurrentTime": "2026-10-28T13:30:00+01:00" } }), expected: allowed("Cond", "C") },
  { name: "PrincipalType reads the principal", set: conditional({ StringEquals: { "fluxiq:PrincipalType": "service-identity" } }), principal: testPrincipal({ type: "service-identity", id: "sync" }), expected: allowed("Cond", "C") }
];

const requests: Vector[] = [
  { name: "a wildcard action in the request is never allowed", set: testPolicySet({ identity: [ALLOW_ALL] }), action: "studio:*", expected: IMPLICIT },
  { name: "a non-canonical action name is never allowed", set: testPolicySet({ identity: [ALLOW_ALL] }), action: "studio:createProject", expected: IMPLICIT },
  { name: "a resource that is not an FRN is never allowed", set: testPolicySet({ identity: [ALLOW_ALL] }), resource: { frn: "frn:fluxiq:studio:ws1:project/*" }, expected: IMPLICIT },
  { name: "a wildcard resource request is never allowed", set: testPolicySet({ identity: [ALLOW_ALL] }), resource: { frn: "*" }, expected: IMPLICIT }
];

const table: Vector[] = [...precedence, ...wildcards, ...negations, ...variables, ...conditions, ...requests];

describe("compileIamPolicySet decide: vector table", () => {
  it("holds at least fifty vectors with distinct names", () => {
    expect(table.length).toBeGreaterThanOrEqual(50);
    expect(new Set(table.map((vector) => vector.name)).size).toBe(table.length);
  });

  it.each(table.map((vector) => [vector.name, vector] as const))("%s", (_name, vector) => {
    const principal = vector.principal ?? testPrincipal();
    const workspaceId = vector.workspaceId === undefined ? principal.workspaceId : vector.workspaceId;
    const compiled = compileIamPolicySet(vector.set, principal, workspaceId);
    const resource = vector.resource ?? { frn: PROJECT };
    const decision = compiled.decide(vector.action ?? CREATE, resource, vector.context ?? testContext());
    expect(decision).toEqual({ resource: resource.frn, ...vector.expected });
  });
});

describe("compileIamPolicySet compiles once", () => {
  it("answers repeated requests from one compiled set", () => {
    const compiled = compileIamPolicySet(testPolicySet({ identity: [ALLOW_CREATE] }), testPrincipal(), "ws1");
    for (let round = 0; round < 3; round += 1) expect(compiled.decide(CREATE, { frn: PROJECT }, testContext()).decision).toBe("allow");
  });

  it("refuses a condition operator the grammar refuses", () => {
    const document = { Version: "2026-10-30" as const, Statement: [{ Effect: "Allow" as const, Action: "*", Resource: "*", Condition: { ArnLike: { "fluxiq:PrincipalId": "x" } } }] };
    const set = testPolicySet({ identity: [{ name: "Bad", kind: "identity", document }] });
    expect(() => compileIamPolicySet(set, testPrincipal(), "ws1")).toThrow(TypeError);
  });
});
