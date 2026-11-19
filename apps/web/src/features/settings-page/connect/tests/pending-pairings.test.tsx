import { createElement } from "react";
import { act, create } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { PendingPairings } from "../PendingPairings";

const requests = [
  { pairingCode: "p1", reference: "ABC-1", name: "Chrome", expiresAt: 10 },
  { pairingCode: "p2", reference: "XYZ-2", name: "Edge", expiresAt: 10 }
];

function stubDialog(code: string | null) {
  vi.stubGlobal("MutationObserver", class { observe() {} disconnect() {} });
  vi.stubGlobal("document", { body: {}, querySelector: () => (code === null ? null : { textContent: ` ${code} ` }) });
}

afterEach(() => vi.unstubAllGlobals());

const labels = (renderer: ReturnType<typeof create>) => renderer.root.findAll((node) => node.type === "button").map((node) => node.children.join(""));

describe("PendingPairings with the confirmation dialog", () => {
  it("offers Approve and Decline for every request while the dialog is closed", async () => {
    stubDialog(null);
    let renderer!: ReturnType<typeof create>;
    await act(async () => { renderer = create(createElement(PendingPairings, { requests, onDone: () => undefined })); });
    expect(labels(renderer)).toEqual(["Approve", "Decline", "Approve", "Decline"]);
  });

  it("shows the request the dialog is asking about as handled there, and keeps the other answerable", async () => {
    stubDialog("ABC-1");
    let renderer!: ReturnType<typeof create>;
    await act(async () => { renderer = create(createElement(PendingPairings, { requests, onDone: () => undefined })); });
    expect(JSON.stringify(renderer.toJSON())).toContain("Being handled in the confirmation dialog.");
    expect(labels(renderer)).toEqual(["Approve", "Decline"]);
  });
});
