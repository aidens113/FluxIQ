import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HomeConnected } from "../HomeConnected";

const ready = { state: "ready" as const, data: [{ clientId: "c1", label: "Chrome on Windows", transport: "websocket", status: "ready", lastSeenAt: 1000 }] };
const html = (waiting: number) => renderToStaticMarkup(createElement(HomeConnected, { clients: ready, waiting, now: 2000 }));

describe("Home's Connected section", () => {
  it("links to Devices and apps with the number of browsers waiting, as the gateway reports it", () => {
    const text = html(2);
    expect(text).toContain("2 waiting to connect");
    expect(text).toContain('href="/security/devices"');
    expect(html(1)).toContain("1 waiting to connect");
  });

  it("says nothing about waiting when nothing is", () => {
    expect(html(0)).not.toContain("waiting to connect");
    expect(html(0)).toContain("Chrome on Windows");
  });

  it("shows pending clients only under Waiting for approval, folded, with revoked ones and the built-in runtime left out", () => {
    const clients = { state: "ready" as const, data: [
      { clientId: "c1", label: "Chrome on Windows", transport: "websocket", status: "ready", lastSeenAt: 1000 },
      { clientId: "s1", label: "Test SDK", transport: "websocket", status: "pairing_required", lastSeenAt: 1000 },
      { clientId: "s2", label: "Test SDK", transport: "websocket", status: "pairing_required", lastSeenAt: 1500 },
      { clientId: "old", label: "Old laptop", transport: "websocket", status: "offline", lastSeenAt: 500 },
      { clientId: "rt", label: "Web Automation Gateway Runtime", transport: "direct", status: "available" }
    ] };
    const revoked = { clientIds: new Set(["old"]), names: new Set<string>() };
    const text = renderToStaticMarkup(createElement(HomeConnected, { clients, waiting: 2, now: 2000, revoked }));
    expect(text.indexOf("Chrome on Windows")).toBeLessThan(text.indexOf("Waiting for approval"));
    expect(text.indexOf("Waiting for approval")).toBeLessThan(text.indexOf("Test SDK"));
    expect(text.match(/Test SDK/g)).toHaveLength(1);
    expect(text).toContain("asked 2 times");
    expect(text).not.toContain("Old laptop");
    expect(text).not.toContain("Gateway Runtime");
    expect(text).not.toContain("Built in");
    expect(text).not.toContain("not known");
  });
});
