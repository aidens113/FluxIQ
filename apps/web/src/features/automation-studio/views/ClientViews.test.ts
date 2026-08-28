import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { clientAuthorizationCopy } from "./ClientViews";

describe("Connected Clients UX contracts", () => {
  it("uses command-specific PIN dialogs and inline pairing resolution", () => {
    expect(clientAuthorizationCopy("start").title).toBe("Start client recording");
    expect(clientAuthorizationCopy("stop").description).toContain("Flow evidence");
    expect(clientAuthorizationCopy("execute").action).toBe("Send action");
    expect(clientAuthorizationCopy("revoke").description).toContain("new pairing approval");
    const source = readFileSync(new URL("./ClientViews.tsx", import.meta.url), "utf8");
    expect(source).toContain("approve-pairing");
    expect(source).toContain("dismiss-pairing");
    expect(source).toContain("if (props.activeRef.current) void refreshGateway()");
    expect(source).toContain("setInterval(refreshWhenActive, 5000)");
    expect(source).toContain("subscribeAutomationMountedViewActivation(refreshWhenActive)");
    expect(source).not.toContain('<Field label="PIN">');
    expect(source).toContain("requirements={{ pin: true }}");
  });
});