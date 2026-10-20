// The host's trace wiring when a process builds more than one runtime, as the
// web host does: it builds a domain-less instance, then, when exactly one
// domain is registered, a second it serves from, abandoning the first
// (`apps/web/src/lib/fluxiq.ts`). The serving runtime's gateway must capture
// the episodes its service opens. Refusing the second installation once left
// that gateway with no source while every run wrote an empty trace (lane T,
// P2 M, measured in the Lab's replays).

import { afterEach, describe, expect, it } from "vitest";
import { AutomationStudioGatewayTraceInstallation } from "../../installation.ts";
import { createAutomationStudioGatewayTraceHost } from "../host.ts";
import type { AutomationStudioGatewayTraceHost } from "../types.ts";

const hosts: AutomationStudioGatewayTraceHost[] = [];

afterEach(() => {
  for (const host of hosts.splice(0)) host.uninstall();
});

const host = (): AutomationStudioGatewayTraceHost => {
  const built = createAutomationStudioGatewayTraceHost({ enabled: true, pool: () => undefined });
  hosts.push(built);
  return built;
};

const episode = { projectId: "project.host", episodeId: "run.host", activity: "execution" as const, context: { schema: { name: "test.host", version: "1" }, value: null } };

describe("createAutomationStudioGatewayTraceHost", () => {
  it("lets the runtime built last serve: its gateway captures the episodes its service opens, the abandoned one's does not", async () => {
    const abandoned = host();
    const serving = host();
    expect(serving.source).toBeDefined();
    expect(AutomationStudioGatewayTraceInstallation.current()).toBe(serving.episodes);

    const installed = AutomationStudioGatewayTraceInstallation.current();
    let servingSink: unknown;
    let abandonedSink: unknown;
    await installed!.run(episode, async () => {
      servingSink = serving.source!.current();
      abandonedSink = abandoned.source!.current();
    });
    expect(servingSink).toBeDefined();
    expect(abandonedSink).toBeUndefined();
  });

  it("builds and installs nothing when off", () => {
    const off = createAutomationStudioGatewayTraceHost({ enabled: false, pool: () => undefined });
    expect(off.source).toBeUndefined();
    expect(off.episodes).toBeUndefined();
    expect(AutomationStudioGatewayTraceInstallation.current()).toBeUndefined();
  });
});
