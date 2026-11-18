import { beforeEach, describe, expect, it, vi } from "vitest";
import { revokeConnectCredential } from "../revoke";

const forget = vi.hoisted(() => vi.fn());
vi.mock("../../browser-trust/teardown", () => ({ forgetClientCredential: forget }));
beforeEach(() => { forget.mockReset(); });
describe("connect credential self-revocation adapter", () => {
  it.each([true, false])("retains the void API after processed teardown (%s)", async result => {
    forget.mockResolvedValue(result);
    await expect(revokeConnectCredential("synthetic-proof")).resolves.toBeUndefined();
    expect(forget).toHaveBeenCalledWith("synthetic-proof", { hostedOnly: true });
  });
  it("propagates operational failure rather than claiming persistence succeeded", async () => {
    forget.mockRejectedValue(new Error("Client trust could not be removed. Please try again."));
    await expect(revokeConnectCredential("synthetic-proof")).rejects.toThrow("Client trust could not be removed");
  });
});
