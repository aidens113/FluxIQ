import { describe, expect, it } from "vitest";
import type { AutomationStudioGatewayTraceEpisodes } from "../episodes.ts";
import { AutomationStudioGatewayTraceInstallation } from "../installation.ts";

const episodes = (label: string): AutomationStudioGatewayTraceEpisodes => ({ label }) as unknown as AutomationStudioGatewayTraceEpisodes;

describe("AutomationStudioGatewayTraceInstallation", () => {
  it("answers nothing until installed, the installed episodes after, and nothing once uninstalled", () => {
    expect(AutomationStudioGatewayTraceInstallation.current()).toBeUndefined();
    const first = episodes("first");
    const uninstall = AutomationStudioGatewayTraceInstallation.install(first);
    expect(AutomationStudioGatewayTraceInstallation.current()).toBe(first);
    uninstall();
    expect(AutomationStudioGatewayTraceInstallation.current()).toBeUndefined();
  });

  it("lets the newest runtime's installation replace an earlier one, which an old uninstall never removes", () => {
    const uninstallFirst = AutomationStudioGatewayTraceInstallation.install(episodes("first"));
    const second = episodes("second");
    const uninstallSecond = AutomationStudioGatewayTraceInstallation.install(second);
    expect(AutomationStudioGatewayTraceInstallation.current()).toBe(second);
    uninstallFirst();
    expect(AutomationStudioGatewayTraceInstallation.current()).toBe(second);
    uninstallSecond();
    expect(AutomationStudioGatewayTraceInstallation.current()).toBeUndefined();
  });
});
