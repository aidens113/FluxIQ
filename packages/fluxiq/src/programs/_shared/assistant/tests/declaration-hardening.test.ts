// What registering an assistant tool now refuses (consent review P9-R2, S2
// and S4): money taken with no declared spend, and a delete or security act
// that says nowhere what it acts on. And how a call's spend is read: from the
// declaration, never from a field's name.
import { describe, expect, it } from "vitest";
import { carryOnTaskAttemptInput, deleteFlowInput, deleteProjectCategoryInput, listProjectsInput, revokeIdentitySessionInput, updateFlowSettingsInput, type CarryOnTaskAttemptInput, type ProgramApiInput } from "@fluxiq/contracts/program-api-inputs";
import { GlobalProgramApiRegistry, type ProgramApiRegistrationParams } from "../../api.ts";
import { endpointResource } from "../../iam/index.ts";
import { assistantCallSpend, type ProgramEndpointAssistantTool } from "../index.ts";

const ok = async () => ({ ok: true });
const studio = { programId: "automation-studio", permission: "flows.write", handler: ok } as const;
const WRONG = /assistant entry that is wrong/u;

function register(params: Omit<ProgramApiRegistrationParams, "programId" | "permission" | "handler"> & Partial<ProgramApiRegistrationParams>): void {
  new GlobalProgramApiRegistry().register({ ...studio, ...params });
}

describe("registering an assistant tool that takes money", () => {
  const carryOn = { endpoint: "carry-on-task-attempt", classification: "authoring", resource: endpointResource.project() } as const;

  it("refuses an input with a money field and no spends", () => {
    expect(() => register({ ...carryOn, assistant: { input: carryOnTaskAttemptInput, summary: "Adds budget and carries on." } })).toThrow(/takes money \(addUsd\) but it declares no spends/u);
  });

  it("refuses a spends that is not a function, and a dollar-named field without the mark", () => {
    expect(() => register({ ...carryOn, assistant: { input: carryOnTaskAttemptInput, summary: "Adds budget.", spends: JSON.parse("5") as () => number } })).toThrow(WRONG);
    // What a contracts input answers for a dollar-named field without the mark (contracts' money-fields test covers the walk itself).
    const unmarked: ProgramApiInput<unknown> = { ...updateFlowSettingsInput, moneyFields: () => { throw new TypeError("capUsd: an amount of US dollars must be a usdAmount, so the calls that spend it say so."); } };
    expect(() => register({ ...carryOn, assistant: { input: unmarked, summary: "Sets a cap.", spends: () => 0 } })).toThrow(/capUsd: an amount of US dollars must be a usdAmount/u);
  });

  it("accepts it with spends, and reads the call's spend from it on the parsed input", () => {
    const assistant: ProgramEndpointAssistantTool = { input: carryOnTaskAttemptInput, summary: "Adds budget.", spends: (input: CarryOnTaskAttemptInput) => input.addUsd };
    expect(() => register({ ...carryOn, assistant })).not.toThrow();
    expect(assistantCallSpend(assistant, { projectId: " p.1 ", attemptId: "a.1", addUsd: 25 })).toBe(25);
    expect(assistantCallSpend(assistant, { projectId: "p.1", attemptId: "a.1", addUsd: 0 })).toBe(0);
  });

  it("reads an input it cannot parse, or a spends that gives no amount, as more than any allowance", () => {
    expect(assistantCallSpend({ input: carryOnTaskAttemptInput, summary: "Adds budget.", spends: (input: CarryOnTaskAttemptInput) => input.addUsd }, { projectId: "p.1", attemptId: "a.1", addUsd: "lots" })).toBe(Number.POSITIVE_INFINITY);
    const valid = { projectId: "p.1", attemptId: "a.1", addUsd: 1 };
    expect(assistantCallSpend({ input: carryOnTaskAttemptInput, summary: "Adds budget.", spends: () => Number.NaN }, valid)).toBe(Number.POSITIVE_INFINITY);
    expect(assistantCallSpend({ input: carryOnTaskAttemptInput, summary: "Adds budget.", spends: () => -1 }, valid)).toBe(Number.POSITIVE_INFINITY);
  });

  it("finds no spend on a call whose endpoint declares none, whatever its fields are called", () => {
    expect(assistantCallSpend({ input: updateFlowSettingsInput, summary: "Changes a Flow." }, { projectId: "p.1", flowId: "f.1", flow: {}, budgetUsd: 500 })).toBeUndefined();
    expect(assistantCallSpend({ hidden: "Not for the assistant." }, { addUsd: 5 })).toBeUndefined();
    expect(assistantCallSpend(undefined, { addUsd: 5 })).toBeUndefined();
  });
});

describe("registering a delete or security tool", () => {
  it("refuses one whose resource names nothing a person could, and no target", () => {
    expect(() => register({ endpoint: "delete-project-category", classification: "destructive", resource: endpointResource.workspace(), assistant: { input: deleteProjectCategoryInput, summary: "Deletes a category." } })).toThrow(/delete act whose resource names nothing/u);
    expect(() => register({ endpoint: "delete-flow", classification: "destructive", assistant: { input: deleteFlowInput, summary: "Deletes a Flow." } })).toThrow(/declare a resource or a target/u);
    expect(() => register({ programId: "identity-access", endpoint: "revoke-session", permission: "identity.manage", classification: "authoring", resource: endpointResource.workspace(), assistant: { input: revokeIdentitySessionInput, summary: "Signs a session out." } })).toThrow(/security act/u);
  });

  it("accepts a target from the resource or from the declaration", () => {
    expect(() => register({ endpoint: "delete-flow", classification: "destructive", resource: endpointResource.projectChild("flow", "flowId"), assistant: { input: deleteFlowInput, summary: "Deletes a Flow." } })).not.toThrow();
    expect(() => register({ endpoint: "delete-project-category", classification: "destructive", resource: endpointResource.workspace(), assistant: { input: deleteProjectCategoryInput, summary: "Deletes a category.", target: { categoryId: "category" } } })).not.toThrow();
    expect(() => register({ programId: "identity-access", endpoint: "revoke-session", permission: "identity.manage", classification: "authoring", resource: endpointResource.workspace(), assistant: { input: revokeIdentitySessionInput, summary: "Signs a session out.", target: { sessionDigest: "sign-in session" } } })).not.toThrow();
  });

  it("refuses a target naming a field the input does not have, or with no word for it", () => {
    expect(() => register({ endpoint: "delete-project-category", classification: "destructive", resource: endpointResource.workspace(), assistant: { input: deleteProjectCategoryInput, summary: "Deletes a category.", target: { categoryIds: "category" } } })).toThrow(/target names categoryIds/u);
    expect(() => register({ endpoint: "delete-project-category", classification: "destructive", resource: endpointResource.workspace(), assistant: { input: deleteProjectCategoryInput, summary: "Deletes a category.", target: { categoryId: " " } } })).toThrow(WRONG);
    expect(() => register({ endpoint: "delete-project-category", classification: "destructive", resource: endpointResource.workspace(), assistant: { input: deleteProjectCategoryInput, summary: "Deletes a category.", target: {} } })).toThrow(WRONG);
  });

  it("refuses a deleting endpoint declared as a change, which would run without asking", () => {
    expect(() => register({ endpoint: "delete-flow", classification: "destructive", resource: endpointResource.projectChild("flow", "flowId"), assistant: { input: deleteFlowInput, summary: "Deletes a Flow.", consequence: "change" } })).toThrow(/consequence cannot be change/u);
  });

  it("asks nothing more of a look at a security program, which acts on nothing", () => {
    expect(() => register({ programId: "identity-access", endpoint: "snapshot", permission: "identity.manage", classification: "read", resource: endpointResource.workspace(), assistant: { input: listProjectsInput, summary: "Lists people and sessions." } })).not.toThrow();
  });
});
