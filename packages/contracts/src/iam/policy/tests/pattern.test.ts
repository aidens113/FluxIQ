// Action and resource patterns, operator names, condition keys and policy
// variables: the pieces of the grammar on their own.
import { describe, expect, it } from "vitest";
import { iamConditionKeyValueType, isIamActionPattern, isIamResourcePattern, parseIamConditionOperator, replaceIamPolicyVariables } from "../index.ts";

describe("IAM policy patterns", () => {
  it("reads action patterns", () => {
    for (const value of ["*", "studio:*", "studio:Read*", "platform:*Account*", "secrets:UseKe?"]) expect(isIamActionPattern(value)).toBe(true);
    for (const value of ["studio", "stu*:Read", "studio:", "studio:Read.All", "studio:${fluxiq:PrincipalId}"]) expect(isIamActionPattern(value)).toBe(false);
  });

  it("reads resource patterns with wildcards and variables in any segment", () => {
    for (const value of ["*", "frn:fluxiq:*:*:*", "frn:fluxiq:st?dio:ws-?:project/*", "frn:fluxiq:platform::account/*", "frn:fluxiq:iam:${fluxiq:WorkspaceId}:user/${fluxiq:PrincipalId}"]) {
      expect(isIamResourcePattern(value)).toBe(true);
    }
    for (const value of ["frn:fluxiq:web:ws:x/*", "frn:fluxiq:studio:ws:", "frn:fluxiq:studio:ws:project/x:y", "frn:fluxiq:studio:$ws:project/*", "frn:fluxiq:studio:ws:project/{x}"]) {
      expect(isIamResourcePattern(value)).toBe(false);
    }
  });

  it("reads operator names with IfExists", () => {
    expect(parseIamConditionOperator("StringLikeIfExists")).toEqual({ operator: "StringLike", ifExists: true, valueType: "string" });
    expect(parseIamConditionOperator("NotIpAddress")).toEqual({ operator: "NotIpAddress", ifExists: false, valueType: "ip" });
    expect(parseIamConditionOperator("IfExists")).toBeNull();
    expect(parseIamConditionOperator("ArnLike")).toBeNull();
  });

  it("types the condition keys", () => {
    expect(iamConditionKeyValueType("fluxiq:CurrentTime")).toBe("date");
    expect(iamConditionKeyValueType("fluxiq:ResourceTag/team")).toBe("string");
    expect(iamConditionKeyValueType("fluxiq:ResourceTag/bad key")).toBeNull();
    expect(iamConditionKeyValueType("fluxiq:Unknown")).toBeNull();
  });

  it("replaces known variables and refuses unknown or stray ones", () => {
    expect(replaceIamPolicyVariables("user/${fluxiq:PrincipalId}", "x")).toBe("user/x");
    expect(replaceIamPolicyVariables("${fluxiq:Nope}", "x")).toBeNull();
    expect(replaceIamPolicyVariables("a$b", "x")).toBeNull();
    expect(replaceIamPolicyVariables("${fluxiq:PrincipalId", "x")).toBeNull();
  });
});
