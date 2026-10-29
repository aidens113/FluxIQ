import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ResetClient } from "../ResetClient";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

async function render(hash: string): Promise<ReactTestRenderer> {
  vi.stubGlobal("window", { location: { hash, pathname: "/reset", search: "" }, history: { replaceState: vi.fn() } });
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(<ResetClient />); });
  return renderer;
}

afterEach(() => vi.unstubAllGlobals());

describe("ResetClient", () => {
  it("asks for the email without a token, warning that old keys stay sealed", async () => {
    const renderer = await render("");
    expect(renderer.root.findAllByType("input")).toHaveLength(1);
    expect(JSON.stringify(renderer.toJSON())).toContain("cannot be opened after a reset");
  });

  it("asks for a new password with a token, with the same warning", async () => {
    const renderer = await render("#token=abc");
    expect(renderer.root.findAllByType("input")).toHaveLength(2);
    expect(JSON.stringify(renderer.toJSON())).toContain("cannot be opened after a reset");
  });
});
