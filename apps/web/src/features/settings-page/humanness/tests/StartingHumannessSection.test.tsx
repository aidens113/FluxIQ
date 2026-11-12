// The Settings page's starting humanness: read, set a number, clear to null, and the program
// not having the endpoints yet (the section says so once; it does not retry in a loop).

import React from "react";
import { act, create } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { FakeElement, withFakeDocument } from "@fluxiq/ui-components/testing";
import type { SettingsPort } from "../../model";
import { StartingHumannessSection } from "../StartingHumannessSection";
import { readMyPreferences, saveStartingHumanness } from "../my-preferences";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const settle = async () => { await act(async () => { await new Promise<void>((resolve) => setTimeout(resolve, 0)); }); };
const textOf = (node: any): string => typeof node === "string" ? node : Array.isArray(node) ? node.map(textOf).join("") : node?.children ? textOf(node.children) : "";

function portOf(stored: number | null | "missing") {
  const calls: Array<{ endpoint: string; payload?: Record<string, unknown> | undefined }> = [];
  const port: SettingsPort = {
    async call(_program, endpoint, payload) {
      calls.push({ endpoint, payload });
      if (stored === "missing") return { ok: false, error: "No such endpoint." };
      if (endpoint === "get-my-preferences") return { ok: true, payload: { startingHumanness: stored } } as any;
      return { ok: true, payload: {} } as any;
    }
  };
  return { port, calls };
}

async function mount(port: SettingsPort, host: FakeElement) {
  let renderer: any;
  await act(async () => { renderer = create(<StartingHumannessSection port={port} />, { createNodeMock: () => host }); });
  await settle();
  return renderer;
}

const rangeOf = (host: FakeElement) => host.descendants().find((e) => e.className.includes("humanness-range"));

describe("the Starting humanness section", () => {
  it("shows the stored value", async () => {
    await withFakeDocument(async () => {
      const host = new FakeElement("div");
      await mount(portOf(45).port, host);
      expect(rangeOf(host)!.value).toBe("45");
    });
  });

  it("sets a number through update-my-preferences", async () => {
    await withFakeDocument(async () => {
      const host = new FakeElement("div");
      const { port, calls } = portOf(null);
      await mount(port, host);
      const slider = rangeOf(host)!;
      slider.value = "60";
      await act(async () => slider.dispatch("change"));
      await settle();
      expect(calls.at(-1)).toEqual({ endpoint: "update-my-preferences", payload: { startingHumanness: 60 } });
    });
  });

  it("clears to null", async () => {
    await withFakeDocument(async () => {
      const host = new FakeElement("div");
      const { port, calls } = portOf(30);
      await mount(port, host);
      await act(async () => host.byClass("humanness-clear")[0]!.dispatch("click"));
      await settle();
      expect(calls.at(-1)).toEqual({ endpoint: "update-my-preferences", payload: { startingHumanness: null } });
    });
  });

  it("is unavailable, not an error loop, when the program has no such endpoint", async () => {
    await withFakeDocument(async () => {
      const host = new FakeElement("div");
      const { port, calls } = portOf("missing");
      const renderer = await mount(port, host);
      await settle();
      expect(textOf(renderer.toJSON())).toContain("not available right now");
      expect(calls).toHaveLength(1);
      expect(rangeOf(host)).toBeUndefined();
    });
  });
});

describe("my preferences", () => {
  it("reads an absent or out-of-range value as none, and a failed read as not ok", async () => {
    expect(await readMyPreferences(portOf(null).port)).toEqual({ ok: true, preferences: { startingHumanness: null } });
    expect(await readMyPreferences(portOf(101).port)).toEqual({ ok: true, preferences: { startingHumanness: null } });
    expect(await readMyPreferences(portOf("missing").port)).toEqual({ ok: false });
    expect(await readMyPreferences({ call: vi.fn(async () => { throw new Error("down"); }) })).toEqual({ ok: false });
  });

  it("answers the refusal in words and nothing when saved", async () => {
    expect(await saveStartingHumanness(portOf(10).port, 20)).toBe("");
    expect(await saveStartingHumanness(portOf("missing").port, 20)).toBe("No such endpoint.");
  });
});
