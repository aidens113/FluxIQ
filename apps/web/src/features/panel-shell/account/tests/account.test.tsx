import { act, create } from "react-test-renderer";
import { afterEach, expect, it, vi } from "vitest";
import { AccountMenu } from "../AccountMenu";
import { signOut, signedOutPath } from "../sign-out";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => vi.unstubAllGlobals());

it("signs out and goes to the sign-in page", async () => {
  const fetchMock = vi.fn(async () => ({ ok: true }));
  vi.stubGlobal("fetch", fetchMock);
  const go = vi.fn();
  expect(await signOut(go)).toBe(true);
  expect(fetchMock).toHaveBeenCalledWith("/api/auth/logout", expect.objectContaining({ method: "POST" }));
  expect(go).toHaveBeenCalledWith("/");
});

it("stays where it is when the server did not end the session", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false })));
  const go = vi.fn();
  expect(await signOut(go)).toBe(false);
  expect(go).not.toHaveBeenCalled();
});

it("offers Sign out in the top bar's account menu and says when it failed", async () => {
  const signOutAction = vi.fn(async () => false);
  let renderer!: ReturnType<typeof create>;
  act(() => { renderer = create(<AccountMenu signOutAction={signOutAction} />); });
  act(() => { renderer.root.findByProps({ "aria-haspopup": "menu" }).props.onClick(); });
  const item = renderer.root.findAllByProps({ role: "menuitem" }).find((node) => node.type === "button")!;
  await act(async () => { item.props.onClick(); });
  expect(signOutAction).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(renderer.toJSON())).toContain("Could not sign out. Try again.");
});

it("signing out stays on the current page, so signing in returns to it", async () => {
  vi.stubGlobal("window", { location: { pathname: "/security/keys", search: "?x=1", hash: "" } });
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true })));
  const go = vi.fn();
  await signOut(go);
  expect(go).toHaveBeenCalledWith("/security/keys?x=1");
  expect(signedOutPath({ pathname: "//evil.example" })).toBe("/");
  expect(signedOutPath(undefined)).toBe("/");
});
