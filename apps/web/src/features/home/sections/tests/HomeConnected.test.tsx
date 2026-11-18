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
});
