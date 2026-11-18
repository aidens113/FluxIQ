import { afterEach, describe, expect, it, vi } from "vitest";
import { CloudAdmissionService } from "fluxiq/platform";
import type { CommerceComposition } from "../../compositions";

vi.mock("../../compose-commerce", () => ({ composedCommerce: vi.fn() }));

import { composedCommerce } from "../../compose-commerce";
import { delegatingCloudAuthorizer } from "../delegating-authorizer";
import { getCloudAdmission } from "../admission";
import { setCloudAuthorizer } from "../set-authorizer";

const request = { actor: "someone", workspaceId: "w", targetId: "t", capability: "execute" };

afterEach(() => {
  setCloudAuthorizer(null);
  vi.mocked(composedCommerce).mockReset();
});

describe("getCloudAdmission", () => {
  it("is null when this server bills nothing", async () => {
    vi.mocked(composedCommerce).mockResolvedValue(null);
    expect(await getCloudAdmission()).toBeNull();
  });

  it("is the admission composed beside the billing service", async () => {
    const admission = new CloudAdmissionService<unknown>({ deploymentMode: "service", authorize: delegatingCloudAuthorizer });
    vi.mocked(composedCommerce).mockResolvedValue({ service: {}, admission, stop: () => undefined } as unknown as CommerceComposition);
    expect(await getCloudAdmission()).toBe(admission);
  });

  it("does not hide a malformed configuration", async () => {
    vi.mocked(composedCommerce).mockRejectedValue(new Error("commerce.configuration: maxVerificationAgeMs (1) must exceed refreshAfterMs (2)."));
    await expect(getCloudAdmission()).rejects.toThrow(/maxVerificationAgeMs/u);
  });
});

describe("the cloud authorizer", () => {
  it("refuses every request until a resolver is installed", async () => {
    expect(await delegatingCloudAuthorizer(request)).toBeNull();
    const admission = new CloudAdmissionService<unknown>({ deploymentMode: "service", authorize: delegatingCloudAuthorizer });
    expect(await admission.admit(request)).toEqual({ allowed: false, reason: "not-authorized" });
  });

  it("asks the installed resolver on every call, and refuses again once it is removed", async () => {
    const resolver = vi.fn(async () => null);
    setCloudAuthorizer(resolver);
    await delegatingCloudAuthorizer(request);
    expect(resolver).toHaveBeenCalledWith(request);
    setCloudAuthorizer(null);
    await delegatingCloudAuthorizer(request);
    expect(resolver).toHaveBeenCalledTimes(1);
  });
});
