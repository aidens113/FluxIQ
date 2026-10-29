import { IAM_PREDEFINED_POLICIES, IAM_STATEMENT_MAX_ENTRIES, parseIamPolicyDocument } from "@fluxiq/contracts/iam";
import { describe, expect, it } from "vitest";
import { IAM_DESTRUCTIVE_ACTIONS, IAM_READ_ONLY_ACTIONS } from "../../catalog/index.ts";
import {
  IAM_CONNECTED_SESSION,
  IAM_PREDEFINED_POLICY_DEFINITIONS,
  IAM_READ_ONLY_ACCESS,
  defineIamPredefinedPolicy,
  iamActionListStatements,
  resolveIamPredefinedPolicy
} from "../index.ts";

function actionsOf(statement: { Action?: string | string[] | undefined }): string[] {
  const element = statement.Action ?? [];
  return typeof element === "string" ? [element] : element;
}

describe("predefined policies", () => {
  it("are exactly the contract's seven, by name, kind and order", () => {
    expect(IAM_PREDEFINED_POLICY_DEFINITIONS.map((policy) => [policy.name, policy.kind])).toEqual(IAM_PREDEFINED_POLICIES.map((policy) => [policy.name, policy.kind]));
  });

  it("each document parses under its own kind and carries a version", () => {
    for (const policy of IAM_PREDEFINED_POLICY_DEFINITIONS) {
      const parsed = parseIamPolicyDocument(JSON.parse(JSON.stringify(policy.document)), policy.kind);
      expect(parsed.success, `${policy.name}: ${parsed.success ? "" : JSON.stringify(parsed.error.issues)}`).toBe(true);
      expect(policy.version).toBe("v1");
      expect(policy.document.Id).toBe(`${policy.name}.v1`);
    }
  });

  it("are frozen to the leaves", () => {
    for (const policy of IAM_PREDEFINED_POLICY_DEFINITIONS) {
      expect(Object.isFrozen(policy)).toBe(true);
      expect(Object.isFrozen(policy.document.Statement)).toBe(true);
      for (const statement of policy.document.Statement) expect(Object.isFrozen(statement)).toBe(true);
    }
    expect(() => {
      (IAM_READ_ONLY_ACCESS.document.Statement as unknown[]).push({});
    }).toThrow(TypeError);
  });

  it("resolve by exact name, and null for anything else", () => {
    for (const policy of IAM_PREDEFINED_POLICIES) expect(resolveIamPredefinedPolicy(policy.name)?.name).toBe(policy.name);
    expect(resolveIamPredefinedPolicy("fluxiqowneraccess")).toBeNull();
    expect(resolveIamPredefinedPolicy("fluxiqOwnerFullAccess")).toBeNull();
    expect(resolveIamPredefinedPolicy("CustomerPolicy")).toBeNull();
    expect(resolveIamPredefinedPolicy("constructor")).toBeNull();
  });

  it("ReadOnlyAccess grants exactly the generated read-only actions, at most 100 per statement", () => {
    const statements = IAM_READ_ONLY_ACCESS.document.Statement;
    const granted = statements.flatMap(actionsOf);
    expect([...granted].sort()).toEqual([...IAM_READ_ONLY_ACTIONS].sort());
    for (const statement of statements) {
      expect(statement.Effect).toBe("Allow");
      expect(statement.Condition).toBeUndefined();
      expect(actionsOf(statement).length).toBeLessThanOrEqual(IAM_STATEMENT_MAX_ENTRIES);
    }
  });

  it("BrowserSession denies every generated destructive action, iam:* and key reveal", () => {
    const denied = IAM_CONNECTED_SESSION.document.Statement.filter((statement) => statement.Effect === "Deny").flatMap(actionsOf);
    for (const action of [...IAM_DESTRUCTIVE_ACTIONS, "iam:*", "secrets:RevealKey"]) expect(denied).toContain(action);
  });

  it("refuses a name outside the contract and a document its kind refuses", () => {
    expect(() => defineIamPredefinedPolicy("FluxIQSomethingElse", "v1", [{ Effect: "Allow", Action: "*", Resource: "*" }])).toThrow(/not a predefined policy/u);
    expect(() => defineIamPredefinedPolicy("FluxIQServiceGuardrail", "v1", [{ Effect: "Allow", Action: "*", Resource: "*" }])).toThrow(/not a valid guardrail policy/u);
  });

  it("splits an action list by service and into chunks of at most 100", () => {
    const many = Array.from({ length: 205 }, (_, index) => `studio:Get${String(index)}`);
    const statements = iamActionListStatements("X", "Allow", [...many, "iam:Snapshot", "studio:Get0"], ["*"]) as Array<{ Sid: string; Action: string[] }>;
    expect(statements.map((statement) => [statement.Sid, statement.Action.length])).toEqual([
      ["XStudio", 100],
      ["XStudio2", 100],
      ["XStudio3", 5],
      ["XIam", 1]
    ]);
  });
});
