import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { clientAuthorizationCopy } from "../clients/client-model";

describe("Connected Clients UX contracts", () => {
  it("uses command-specific PIN dialogs and inline pairing resolution", () => {
    expect(clientAuthorizationCopy("start").title).toBe("Start client recording");
    expect(clientAuthorizationCopy("stop").description).toContain("Flow evidence");
    expect(clientAuthorizationCopy("execute").action).toBe("Send action");
    expect(clientAuthorizationCopy("revoke").description).toContain("new pairing approval");

    const apiSource = readFileSync(new URL("../clients/client-commands.ts", import.meta.url), "utf8");
    const controllerSource = readFileSync(new URL("../clients/useClientGatewayController.ts", import.meta.url), "utf8");
    const viewSource = readFileSync(new URL("../clients/ClientGatewayView.tsx", import.meta.url), "utf8");
    expect(apiSource).toContain("approve-pairing");
    expect(apiSource).toContain("dismiss-pairing");
    expect(controllerSource).toContain("if (!props.active)");
    expect(controllerSource).not.toContain("setInterval");
    expect(controllerSource).toContain("createActivePoller");
    expect(controllerSource).not.toContain("subscribeMountedViewActivation");
    expect(viewSource).not.toContain('<Field label="PIN">');
    expect(viewSource).toContain("requirements={{ pin: true }}");
  });

  it("keeps retired Config outside the supported client domain", () => {
    const clientSource = readFileSync(new URL("../clients/ClientGatewayView.tsx", import.meta.url), "utf8");
    expect(clientSource).not.toContain("InspectorView");
    expect(clientSource).not.toContain("AutomationConfigView");
    expect(existsSync(new URL("../legacy/config", import.meta.url))).toBe(false);
  });
});