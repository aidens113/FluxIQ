import { afterEach, describe, expect, it, vi } from "vitest";
import { postSetup } from "../postSetup";
import { takeSetupCodeFromLink } from "../takeSetupCodeFromLink";

// The setup page reads the code from the link's fragment, takes it out of the
// address bar, and sends it only in a request body. The code here is a dummy.

const CODE = "0123456789abcdef0123456789abcdef01234567";

function linkWindow(hash: string) {
  const replaceState = vi.fn();
  return { view: { location: { pathname: "/setup", search: "", hash }, history: { replaceState } }, replaceState };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the setup link's code", () => {
  it("is read from the fragment and removed from the address bar", () => {
    const { view, replaceState } = linkWindow(`#${CODE}`);
    expect(takeSetupCodeFromLink(view)).toBe(CODE);
    expect(replaceState).toHaveBeenCalledWith(null, "", "/setup");
    expect(JSON.stringify(replaceState.mock.calls)).not.toContain(CODE);
  });

  it("is empty when the link carried none, and the address bar is left alone", () => {
    const { view, replaceState } = linkWindow("");
    expect(takeSetupCodeFromLink(view)).toBe("");
    expect(replaceState).not.toHaveBeenCalled();
  });

  it("is posted in the body, never in the URL", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ ok: true, redirectTo: "/" }), { status: 200 }));
    vi.stubGlobal("fetch", fetcher);
    await postSetup({ code: CODE, username: "owner", password: "dummy", confirmation: "dummy" });
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/setup/submit");
    expect(url).not.toContain(CODE);
    expect(JSON.parse(String(init.body))).toMatchObject({ code: CODE });
  });
});
