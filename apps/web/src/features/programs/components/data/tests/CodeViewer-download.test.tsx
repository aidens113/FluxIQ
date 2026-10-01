import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CodeViewer } from "..";

let renderer: ReactTestRenderer | undefined;
let anchor: { href: string; download: string; click: ReturnType<typeof vi.fn> };
let alerts: { tone: string; message: string }[];
let createLink: ReturnType<typeof vi.fn>;
const filename = "synthetic-source.json";
const source = '{"synthetic":true}';

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  anchor = { href: "", download: "", click: vi.fn() };
  alerts = [];
  createLink = vi.fn(() => anchor);
  vi.stubGlobal("document", { createElement: createLink });
  vi.stubGlobal("window", { dispatchEvent: (event: CustomEvent<{ tone: string; message: string }>) => { alerts.push(event.detail); return true; } });
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:synthetic-download");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
});
afterEach(() => {
  if (renderer) act(() => renderer!.unmount());
  renderer = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function activate() {
  await act(async () => { renderer = create(<CodeViewer label="Synthetic source" code={source} filename={filename} />); });
  act(() => renderer!.root.findAllByType("button").find((node) => node.props["aria-label"] === "Download source")!.props.onClick());
}

it("revokes the allocated URL when starting a download throws", async () => {
  anchor.click.mockImplementation(() => { throw new Error("Synthetic click failure"); });
  await activate();
  expect(URL.revokeObjectURL).toHaveBeenCalledOnce();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:synthetic-download");
  expect(alerts).toEqual([expect.objectContaining({ tone: "error", message: `${filename} could not be downloaded.` })]);
});
it("revokes the allocated URL when creating its anchor throws", async () => {
  createLink.mockImplementation(() => { throw new Error("Synthetic anchor failure"); });
  await activate();
  expect(URL.revokeObjectURL).toHaveBeenCalledOnce();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:synthetic-download");
  expect(anchor.click).not.toHaveBeenCalled();
  expect(alerts[0]?.tone).toBe("error");
});
it("revokes the allocated URL when configuring its filename throws", async () => {
  Object.defineProperty(anchor, "download", { set() { throw new Error("Synthetic configuration failure"); } });
  await activate();
  expect(URL.revokeObjectURL).toHaveBeenCalledOnce();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:synthetic-download");
  expect(anchor.click).not.toHaveBeenCalled();
  expect(alerts[0]?.tone).toBe("error");
});
it("starts the current download and releases its URL exactly once", async () => {
  await activate();
  expect(createLink).toHaveBeenCalledWith("a");
  expect(anchor).toMatchObject({ href: "blob:synthetic-download", download: filename });
  expect(anchor.click).toHaveBeenCalledOnce();
  expect(URL.revokeObjectURL).toHaveBeenCalledOnce();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:synthetic-download");
  const blob = vi.mocked(URL.createObjectURL).mock.calls[0]![0];
  expect(blob).toBeInstanceOf(Blob);
  expect(await (blob as Blob).text()).toBe(source);
  expect(alerts).toEqual([expect.objectContaining({ tone: "success", message: `${filename} download started.` })]);
});
it("creates no anchor or revocation when URL allocation fails", async () => {
  vi.mocked(URL.createObjectURL).mockImplementation(() => { throw new Error("Synthetic allocation failure"); });
  await activate();
  expect(createLink).not.toHaveBeenCalled();
  expect(anchor.click).not.toHaveBeenCalled();
  expect(URL.revokeObjectURL).not.toHaveBeenCalled();
  expect(alerts[0]?.tone).toBe("error");
});
