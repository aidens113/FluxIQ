import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WelcomeClient } from "../WelcomeClient";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function stubWindow(hash: string) {
  const replaceState = vi.fn();
  vi.stubGlobal("window", { location: { hash, pathname: "/welcome", search: "" }, history: { replaceState } });
  return replaceState;
}

async function render(): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(<WelcomeClient />); });
  return renderer;
}

afterEach(() => vi.unstubAllGlobals());

describe("WelcomeClient", () => {
  it("clears the fragment at once and asks for a password and its confirmation", async () => {
    const replaceState = stubWindow("#token=abc");
    const renderer = await render();
    expect(replaceState).toHaveBeenCalledWith(null, "", "/welcome");
    expect(renderer.root.findAllByType("input")).toHaveLength(2);
  });

  it("shows the one invalid-link message when there is no token", async () => {
    stubWindow("");
    const renderer = await render();
    expect(JSON.stringify(renderer.toJSON())).toContain("Resend it from the site you signed up on");
  });
});
