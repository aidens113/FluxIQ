// The IAM policy grammar: documents in the shapes the plan's predefined
// policies take are accepted, and every malformed or over-broad document is
// refused with its path.
import { describe, expect, it } from "vitest";
import { IAM_POLICY_LANGUAGE_VERSION, parseIamPolicyDocument, type IamPolicyKind } from "../index.ts";

const V = IAM_POLICY_LANGUAGE_VERSION;

function accepts(document: unknown, kind: IamPolicyKind = "identity"): void {
  const parsed = parseIamPolicyDocument(document, kind);
  expect(parsed.success ? [] : parsed.error.issues).toEqual([]);
}

function refuses(document: unknown, kind: IamPolicyKind = "identity"): string[] {
  const parsed = parseIamPolicyDocument(document, kind);
  expect(parsed.success).toBe(false);
  return parsed.success ? [] : parsed.error.issues.map((issue) => issue.path.join("."));
}

describe("IAM policy documents: acceptance", () => {
  it("accepts the owner's full access", () => {
    accepts({ Version: V, Id: "FluxIQOwnerFullAccess", Statement: [{ Sid: "All", Effect: "Allow", Action: "*", Resource: "frn:fluxiq:*:${fluxiq:WorkspaceId}:*" }] });
  });

  it("accepts own-data access with a resource-owner condition and self-service", () => {
    accepts({
      Version: V,
      Statement: [
        {
          Sid: "OwnData",
          Effect: "Allow",
          Action: ["studio:*", "secrets:*", "gateway:*"],
          Resource: "frn:fluxiq:*:${fluxiq:WorkspaceId}:*",
          Condition: { StringEquals: { "fluxiq:ResourceOwner": "${fluxiq:PrincipalId}" } }
        },
        { Sid: "Self", Effect: "Allow", Action: ["iam:ChangePassword", "iam:Revoke*"], Resource: "frn:fluxiq:iam:${fluxiq:WorkspaceId}:user/${fluxiq:PrincipalId}" }
      ]
    });
  });

  it("accepts the provisioner's allow with an explicit content deny", () => {
    accepts({
      Version: V,
      Statement: [
        { Sid: "Accounts", Effect: "Allow", Action: "platform:*Account*", Resource: ["frn:fluxiq:platform::account/*", "frn:fluxiq:platform::workspace/*"] },
        { Sid: "NoContent", Effect: "Deny", Action: ["studio:*", "secrets:*", "gateway:*"], Resource: "*" }
      ]
    });
  });

  it("accepts NotAction, NotResource, tags, every operator and IfExists", () => {
    accepts({
      Version: V,
      Statement: [
        { Effect: "Allow", NotAction: "iam:*", NotResource: "frn:fluxiq:ops:*:*" },
        {
          Effect: "Allow",
          Action: "studio:Read*",
          Resource: "frn:fluxiq:studio:${fluxiq:WorkspaceId}:project/*",
          Condition: {
            StringLike: { "fluxiq:ResourceTag/team": ["sales", "sales-*"] },
            StringNotEquals: { "fluxiq:RequestOrigin": "schedule" },
            BoolIfExists: { "fluxiq:MfaPresent": true },
            Bool: { "fluxiq:MfaPresent": "true" },
            IpAddress: { "fluxiq:SourceIp": ["203.0.113.0/24", "2001:db8::/32", "198.51.100.7"] },
            NotIpAddress: { "fluxiq:SourceIp": "10.0.0.0/8" },
            DateLessThan: { "fluxiq:CurrentTime": "2027-01-01T00:00:00Z" },
            DateGreaterThanIfExists: { "fluxiq:CurrentTime": "2026-10-30" },
            StringEqualsIfExists: { "fluxiq:ConnectedBrowserId": "cb-1", "fluxiq:Profile": ["service", "self-hosted"] }
          }
        }
      ]
    });
  });

  it("accepts a deny-only guardrail, a session policy and a boundary", () => {
    const guardrail = { Version: V, Statement: [{ Sid: "NoOps", Effect: "Deny", Action: ["ops:*", "platform:*"], Resource: "*" }] };
    accepts(guardrail, "guardrail");
    accepts({ Version: V, Statement: [{ Effect: "Allow", Action: ["gateway:Connect", "studio:Get*", "studio:Run*"], Resource: "*" }] }, "session");
    accepts({ Version: V, Statement: [{ Effect: "Allow", Action: "studio:*", Resource: "*" }] }, "boundary");
  });

  it("accepts a role trust policy", () => {
    accepts({ Version: V, Statement: [{ Effect: "Allow", Principal: { FluxIQ: "frn:fluxiq:iam:ws-1:group/auditors" }, Action: "iam:AssumeRole" }] }, "trust");
  });
});

describe("IAM policy documents: refusal", () => {
  it("refuses a wrong or missing version, no statements, and unknown fields", () => {
    refuses({ Version: "2012-10-17", Statement: [{ Effect: "Allow", Action: "*", Resource: "*" }] });
    refuses({ Statement: [{ Effect: "Allow", Action: "*", Resource: "*" }] });
    refuses({ Version: V, Statement: [] });
    refuses({ Version: V, Statement: { Effect: "Allow", Action: "*", Resource: "*" } });
    expect(refuses({ Version: V, Statement: [{ Efect: "Allow", Action: "*", Resource: "*" }] })).toContain("Statement.0");
    refuses({ Version: V, Extra: 1, Statement: [{ Effect: "Allow", Action: "*", Resource: "*" }] });
  });

  it("refuses a statement without exactly one action and one resource element", () => {
    expect(refuses({ Version: V, Statement: [{ Effect: "Allow", Resource: "*" }] })).toContain("Statement.0.Action");
    expect(refuses({ Version: V, Statement: [{ Effect: "Allow", Action: "*", NotAction: "iam:*", Resource: "*" }] })).toContain("Statement.0.Action");
    expect(refuses({ Version: V, Statement: [{ Effect: "Allow", Action: "*" }] })).toContain("Statement.0.Resource");
    expect(refuses({ Version: V, Statement: [{ Effect: "Allow", Action: "*", Resource: "*", NotResource: "*" }] })).toContain("Statement.0.Resource");
  });

  it("refuses bad effects, duplicate Sids and ill-formed Sids", () => {
    refuses({ Version: V, Statement: [{ Effect: "Permit", Action: "*", Resource: "*" }] });
    expect(
      refuses({
        Version: V,
        Statement: [
          { Sid: "A", Effect: "Allow", Action: "*", Resource: "*" },
          { Sid: "A", Effect: "Deny", Action: "ops:*", Resource: "*" }
        ]
      })
    ).toContain("Statement.1.Sid");
    refuses({ Version: V, Statement: [{ Sid: "not allowed", Effect: "Allow", Action: "*", Resource: "*" }] });
  });

  it.each([["studio"], ["*:CreateProject"], ["web:Click"], ["studio:Create-Project"], ["studio:${fluxiq:PrincipalId}"], [""], [[]]])("refuses action %j", (action) => {
    expect(refuses({ Version: V, Statement: [{ Effect: "Allow", Action: action, Resource: "*" }] }).length).toBeGreaterThan(0);
  });

  it.each([
    "project/*",
    "frn:fluxiq:studio:ws-1",
    "frn:fluxiq:web:ws-1:page/*",
    "frn:fluxiq:studio:${fluxiq:UserName}:project/*",
    "frn:fluxiq:studio:${fluxiq:WorkspaceId:project/*",
    "frn:fluxiq:studio:ws-1:project/a b",
    "arn:aws:s3:::bucket"
  ])("refuses resource %j", (resource) => {
    refuses({ Version: V, Statement: [{ Effect: "Allow", Action: "*", Resource: resource }] });
  });

  it("refuses unknown operators and keys, and values that do not fit", () => {
    const statement = (condition: unknown) => ({ Version: V, Statement: [{ Effect: "Allow", Action: "*", Resource: "*", Condition: condition }] });
    refuses(statement({ NumericEquals: { "fluxiq:PrincipalId": "1" } }));
    refuses(statement({ StringEquals: { "aws:PrincipalArn": "x" } }));
    refuses(statement({ StringEquals: { "fluxiq:ResourceTag/": "x" } }));
    refuses(statement({ StringEquals: { "fluxiq:SourceIp": "10.0.0.1" } }));
    refuses(statement({ IpAddress: { "fluxiq:SourceIp": "10.0.0.256" } }));
    refuses(statement({ IpAddress: { "fluxiq:SourceIp": "10.0.0.0/33" } }));
    refuses(statement({ Bool: { "fluxiq:MfaPresent": "yes" } }));
    refuses(statement({ DateLessThan: { "fluxiq:CurrentTime": "tomorrow" } }));
    refuses(statement({ StringEquals: { "fluxiq:PrincipalId": "${fluxiq:Other}" } }));
    refuses(statement({ StringEquals: {} }));
    refuses(statement({}));
    refuses(statement({ StringEquals: { "fluxiq:PrincipalId": [] } }));
  });

  it("holds each kind to its own rules", () => {
    expect(refuses({ Version: V, Statement: [{ Effect: "Allow", Action: "ops:*", Resource: "*" }] }, "guardrail")).toContain("Statement.0.Effect");
    expect(refuses({ Version: V, Statement: [{ Effect: "Allow", Principal: { FluxIQ: "frn:fluxiq:iam:ws-1:user/u1" }, Action: "*", Resource: "*" }] })).toContain(
      "Statement.0.Principal"
    );
    expect(refuses({ Version: V, Statement: [{ Effect: "Allow", Action: "iam:AssumeRole" }] }, "trust")).toContain("Statement.0.Principal");
    expect(refuses({ Version: V, Statement: [{ Effect: "Allow", Principal: { FluxIQ: "frn:fluxiq:iam:ws-1:user/u1" }, Action: "iam:*" }] }, "trust")).toContain("Statement.0.Action");
    expect(
      refuses({ Version: V, Statement: [{ Effect: "Allow", Principal: { FluxIQ: "frn:fluxiq:iam:ws-1:user/u1" }, Action: "iam:AssumeRole", Resource: "*" }] }, "trust")
    ).toContain("Statement.0.Resource");
  });
});
