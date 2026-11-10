// The assistant consequence of an endpoint, derived from its classification and access level.
import { describe, expect, it } from "vitest";
import { IAM_ACCESS_LEVELS, type IamAccessLevel } from "@fluxiq/contracts/iam";
import { ASSISTANT_CONSEQUENCE_OVERRIDES, assistantEndpointConsequence } from "../index.ts";

const CLASSIFICATIONS = ["read", "authoring", "destructive", "destructive-ungated", "program-gated"] as const;

function of(classification: string, accessLevel: IamAccessLevel, programId = "automation-studio", endpoint = "do-thing") {
  return assistantEndpointConsequence({ programId, endpoint, classification, accessLevel });
}

describe("assistantEndpointConsequence", () => {
  it("covers every classification under every access level", () => {
    const table: Record<string, Record<string, string>> = {};
    for (const classification of CLASSIFICATIONS) {
      table[classification] = {};
      for (const level of IAM_ACCESS_LEVELS) table[classification][level] = of(classification, level);
    }
    expect(IAM_ACCESS_LEVELS).toEqual(["List", "Read", "Write", "PermissionsManagement"]);
    expect(table).toEqual({
      read: { List: "read", Read: "read", Write: "read", PermissionsManagement: "security" },
      authoring: { List: "read", Read: "read", Write: "change", PermissionsManagement: "security" },
      destructive: { List: "delete", Read: "delete", Write: "delete", PermissionsManagement: "security" },
      "destructive-ungated": { List: "delete", Read: "delete", Write: "delete", PermissionsManagement: "security" },
      "program-gated": { List: "security", Read: "security", Write: "security", PermissionsManagement: "security" }
    });
  });

  it("makes every identity-access and secret-keys endpoint security, even a read", () => {
    expect(of("read", "List", "identity-access", "list-users")).toBe("security");
    expect(of("authoring", "Write", "secret-keys", "create-key")).toBe("security");
  });

  it("takes the overrides table before the rules", () => {
    expect(of("authoring", "Write", "automation-studio", "revoke-client-trust")).toBe("security");
    for (const endpoint of ["start-runtime-session", "run-runtime-session", "run-task-again", "run-project-part", "resume-runtime-session"]) {
      expect(of("authoring", "Write", "automation-studio", endpoint)).toBe("per-call");
    }
    expect(Object.keys(ASSISTANT_CONSEQUENCE_OVERRIDES)).toHaveLength(6);
  });

  it("lets an explicit consequence win over the table and the rules", () => {
    expect(assistantEndpointConsequence({ programId: "automation-studio", endpoint: "run-task-again", classification: "authoring", accessLevel: "Write", declared: "change" })).toBe("change");
    expect(assistantEndpointConsequence({ programId: "secret-keys", endpoint: "list-keys", classification: "read", accessLevel: "List", declared: "read" })).toBe("read");
  });

  it("refuses a classification it has no rule for", () => {
    expect(() => of("archival", "Write")).toThrow(/no assistant consequence/u);
  });
});
