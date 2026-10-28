// P6 (t769, D44): the host installs what offline-first trials need once, as it
// installs trace episodes; `FLUXIQ_OFFLINE_TRIALS=0` turns them off for the
// process (P7's off/on measurement), whatever is installed.
import { afterEach, describe, expect, it } from "vitest";
import { ClientGatewayService, ClientGatewayTraceMemoryStore } from "../../../../../../client-gateway/index.ts";
import { AutomationStudioOfflineTrialInstallation, type AutomationStudioOfflineTrialHost } from "../index.ts";

const ENV = "FLUXIQ_OFFLINE_TRIALS";
const before = process.env[ENV];
const gateways: ClientGatewayService[] = [];

afterEach(async () => {
  if (before === undefined) delete process.env[ENV];
  else process.env[ENV] = before;
  await Promise.all(gateways.splice(0).map((gateway) => gateway.close()));
});

function host(): AutomationStudioOfflineTrialHost {
  const gateway = new ClientGatewayService({ commandTimeoutMs: 1_000 });
  gateways.push(gateway);
  const store = new ClientGatewayTraceMemoryStore();
  return { gateway, storeFor: () => store, sessionViewFor: () => undefined };
}

describe("the offline trial installation", () => {
  it("answers what was installed last, and nothing once that is uninstalled", () => {
    delete process.env[ENV];
    const first = host(), second = host();
    const uninstallFirst = AutomationStudioOfflineTrialInstallation.install(first);
    const uninstallSecond = AutomationStudioOfflineTrialInstallation.install(second);

    expect(AutomationStudioOfflineTrialInstallation.current()).toBe(second);
    // Uninstalling a replaced installation leaves the newer one.
    uninstallFirst();
    expect(AutomationStudioOfflineTrialInstallation.current()).toBe(second);
    uninstallSecond();
    expect(AutomationStudioOfflineTrialInstallation.current()).toBeUndefined();
  });

  it("answers nothing while the process turns offline trials off", () => {
    const installed = host();
    const uninstall = AutomationStudioOfflineTrialInstallation.install(installed);
    try {
      process.env[ENV] = "0";
      expect(AutomationStudioOfflineTrialInstallation.current()).toBeUndefined();
      process.env[ENV] = "1";
      expect(AutomationStudioOfflineTrialInstallation.current()).toBe(installed);
    } finally {
      uninstall();
    }
  });
});
