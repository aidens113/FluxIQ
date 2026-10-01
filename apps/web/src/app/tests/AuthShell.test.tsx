import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GlobalTopbar, LoginPanel, setupPasswordError } from "../AuthShell";

describe("FluxIQ login and first setup", () => {
  it("restores expired sessions without replacing the current workspace", () => {
    const source = readFileSync(new URL("../AuthShell.tsx", import.meta.url), "utf8");
    const host = readFileSync(new URL("../session-reauthentication/SessionReauthentication.tsx", import.meta.url), "utf8");
    expect(source).not.toContain("<SessionReauthentication");
    expect(host).toContain("resolveProgramAuthentication(true)");
    expect(host).toContain("Keep work open");
  });

  it("renders a password-manager-friendly login without publishing bootstrap credentials", () => {
    const html = renderToStaticMarkup(<LoginPanel />);
    expect(html).toContain('autoComplete="username"');
    expect(html).toContain('autoComplete="current-password"');
    expect(html).toContain('aria-label="Show password"');
    expect(html).toContain("FluxIQ");
    expect(html).not.toContain("admin / admin");
    expect(html).not.toContain("First setup uses");
  });

  it("renders semantic global context and an account menu trigger", () => {
    const html = renderToStaticMarkup(<GlobalTopbar breadcrumbs={[{ label: "Programs", href: "/" }, { label: "Automation Studio" }]} user={{ displayName: "Operator", roleId: "admin" }} />);
    expect(html).toContain('aria-label="FluxIQ programs"');
    expect(html).toContain('aria-label="Breadcrumb"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('aria-haspopup="menu"');
    expect(html).toContain("Operator");
  });
  it("requires a replacement password with confirmation", () => {
    expect(setupPasswordError("short", "short")).toContain("12 characters");
    expect(setupPasswordError("admin", "admin")).toContain("12 characters");
    expect(setupPasswordError("a-secure-password", "different-value")).toContain("do not match");
    expect(setupPasswordError("a-secure-password", "a-secure-password")).toBe("");
  });
});

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let loginRenderer: ReactTestRenderer | undefined;
afterEach(async () => { if (loginRenderer) await act(async () => loginRenderer!.unmount()); loginRenderer = undefined; vi.unstubAllGlobals(); });
function response(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }); }
async function mountLogin(target: string, fetcher: ReturnType<typeof vi.fn> = vi.fn(async () => response({ ok: true }))) {
  const url = new URL(target, "https://panel.invalid");
  const location = { origin: url.origin, pathname: url.pathname, search: url.search, hash: url.hash, href: url.href };
  vi.stubGlobal("window", { location }); vi.stubGlobal("fetch", fetcher);
  await act(async () => { loginRenderer = create(<LoginPanel />); });
  await act(async () => {
    loginRenderer!.root.findByProps({ name: "username" }).props.onChange({ target: { value: "operator" } });
    loginRenderer!.root.findByProps({ name: "password" }).props.onChange({ target: { value: "password-retained" } });
  });
  return { location, fetcher };
}
async function submitLogin() { await act(async () => { await loginRenderer!.root.findByType("form").props.onSubmit({ preventDefault: vi.fn() }); }); }
async function enterReplacement() {
  const inputs = loginRenderer!.root.findAllByType("input");
  await act(async () => { for (const input of inputs) input.props.onChange({ target: { value: "new-secure-password" } }); });
}
describe("initial sign-in destination", () => {
  it.each(["path", "query", "hash"])("allows current-route login on the same mounted panel after a pending %s change", async (change) => {
    let finish!: (value: Response) => void;
    const pending = new Promise<Response>((resolve) => { finish = resolve; });
    const fetcher = vi.fn().mockReturnValueOnce(pending).mockResolvedValueOnce(response({ ok: true }));
    const { location } = await mountLogin("/programs/docs?doc=old", fetcher);
    let request!: Promise<void>; await act(async () => { request = loginRenderer!.root.findByType("form").props.onSubmit({ preventDefault: vi.fn() }); });
    if (change === "path") location.pathname = "/get-started";
    else if (change === "query") location.search = "?doc=current";
    else location.hash = "#current";
    const target = location.pathname + location.search + location.hash;
    location.href = `https://panel.invalid${target}`;
    await act(async () => { finish(response({ ok: true })); await request; });
    expect(location.href).toBe(`https://panel.invalid${target}`);
    expect(loginRenderer!.root.findAllByType("button").find((button) => button.props.type === "submit")!.props.disabled).toBe(false);
    await submitLogin();
    expect(fetcher).toHaveBeenCalledTimes(2); expect(location.href).toBe(target);
  });
  it("allows replacement retry on the same mounted panel after its query changes", async () => {
    let finish!: (value: Response) => void; const pending = new Promise<Response>((resolve) => { finish = resolve; });
    const fetcher = vi.fn().mockResolvedValueOnce(response({ payload: { requiresCredentialSetup: true, user: { id: "user.setup" } } })).mockReturnValueOnce(pending).mockResolvedValueOnce(response({ ok: true }));
    const { location } = await mountLogin("/get-started?domainId=old", fetcher); await submitLogin(); await enterReplacement();
    let request!: Promise<void>; await act(async () => { request = loginRenderer!.root.findByType("form").props.onSubmit({ preventDefault: vi.fn() }); });
    location.search = "?domainId=current"; location.href = "https://panel.invalid/get-started?domainId=current";
    await act(async () => { finish(response({ ok: true })); await request; });
    expect(location.href).toBe("https://panel.invalid/get-started?domainId=current");
    expect(loginRenderer!.root.findAllByType("button").find((button) => button.props.type === "submit")!.props.disabled).toBe(false);
    await submitLogin(); expect(fetcher).toHaveBeenCalledTimes(3); expect(location.href).toBe("/get-started?domainId=current");
  });
  it.each(["/", "/domains/web?scope=team#programs", "/get-started?domainId=web", "/programs/docs?domainId=web&doc=a%2Fb#chapter", "/programs/automation-studio?project=p&flow=f&subflow=s&view=runtime-debug&detail=run%3Ar&start=describe&domainId=web&extra=1&extra=2#keep"])("returns to the actual requested local destination %s", async (target) => {
    const { location, fetcher } = await mountLogin(target);
    expect(fetcher).not.toHaveBeenCalled();
    await submitLogin();
    expect(location.href).toBe(target);
    expect(JSON.parse(fetcher.mock.calls[0]![1]!.body as string)).toEqual({ username: "operator", password: "password-retained" });
  });
  it("never treats an arbitrary returnTo query as redirect authority", async () => {
    const target = "/get-started?domainId=web&returnTo=https%3A%2F%2Foutside.invalid";
    const { location } = await mountLogin(target); await submitLogin(); expect(location.href).toBe(target);
  });
  it("keeps the destination through an authenticator challenge, refusal and retry", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(response({ requiresTotp: true }, 401)).mockResolvedValueOnce(response({ requiresTotp: true }, 401)).mockResolvedValueOnce(response({ ok: true }));
    const target = "/programs/docs?domainId=web&doc=guide#section";
    const { location } = await mountLogin(target, fetcher);
    await submitLogin(); expect(location.href).toBe(`https://panel.invalid${target}`);
    await act(async () => loginRenderer!.root.findByProps({ name: "totp" }).props.onChange({ target: { value: "123456" } }));
    await submitLogin(); expect(location.href).toBe(`https://panel.invalid${target}`);
    await submitLogin(); expect(location.href).toBe(target);
    expect(JSON.parse(fetcher.mock.calls[2]![1].body)).toEqual({ username: "operator", password: "password-retained", totp: "123456" });
  });
  it("retains the initial destination through failed and successful credential replacement", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(response({ payload: { requiresCredentialSetup: true, user: { id: "user.setup" } } })).mockResolvedValueOnce(response({ ok: false, error: "Retry replacement" }, 400)).mockResolvedValueOnce(response({ ok: true }));
    const target = "/get-started?domainId=web#setup";
    const { location } = await mountLogin(target, fetcher); await submitLogin();
    expect(location.href).toBe(`https://panel.invalid${target}`); await enterReplacement();
    await submitLogin(); expect(location.href).toBe(`https://panel.invalid${target}`);
    expect(loginRenderer!.root.findAllByType("input").map((input) => input.props.value)).toEqual(["new-secure-password", "new-secure-password"]);
    await submitLogin(); expect(location.href).toBe(target);
    expect(JSON.parse(fetcher.mock.calls[2]![1].body)).toEqual({ userId: "user.setup", value: "new-secure-password", authorizationPassword: "password-retained" });
  });
  it("retains destination and entries after network failure until explicit retry", async () => {
    const fetcher = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(response({ ok: true }));
    const target = "/domains/web#programs"; const { location } = await mountLogin(target, fetcher);
    await submitLogin(); expect(location.href).toBe(`https://panel.invalid${target}`);
    expect(loginRenderer!.root.findByProps({ name: "password" }).props.value).toBe("password-retained");
    await submitLogin(); expect(location.href).toBe(target);
  });
  it.each(["login", "setup"])("drops late %s success after unmount", async (stage) => {
    let finish!: (value: Response) => void;
    const pending = new Promise<Response>((resolve) => { finish = resolve; });
    const fetcher = vi.fn();
    if (stage === "setup") fetcher.mockResolvedValueOnce(response({ payload: { requiresCredentialSetup: true, user: { id: "user.setup" } } }));
    fetcher.mockReturnValueOnce(pending);
    const { location } = await mountLogin("/programs/docs?doc=old", fetcher);
    if (stage === "setup") { await submitLogin(); await enterReplacement(); }
    let request!: Promise<void>; await act(async () => { request = loginRenderer!.root.findByType("form").props.onSubmit({ preventDefault: vi.fn() }); });
    await act(async () => loginRenderer!.unmount()); loginRenderer = undefined;
    await act(async () => { finish(response({ ok: true })); await request; });
    expect(location.href).toBe("https://panel.invalid/programs/docs?doc=old");
  });
  it.each(["login", "setup"])("drops late %s completion after actual query navigation", async (stage) => {
    let finish!: (value: Response) => void; const pending = new Promise<Response>((resolve) => { finish = resolve; });
    const fetcher = vi.fn();
    if (stage === "setup") fetcher.mockResolvedValueOnce(response({ payload: { requiresCredentialSetup: true, user: { id: "user.setup" } } }));
    fetcher.mockReturnValueOnce(pending);
    const { location } = await mountLogin("/programs/docs?doc=old", fetcher);
    if (stage === "setup") { await submitLogin(); await enterReplacement(); }
    let request!: Promise<void>; await act(async () => { request = loginRenderer!.root.findByType("form").props.onSubmit({ preventDefault: vi.fn() }); });
    location.search = "?doc=new"; location.href = "https://panel.invalid/programs/docs?doc=new";
    await act(async () => { finish(response({ ok: true })); await request; });
    expect(location.href).toBe("https://panel.invalid/programs/docs?doc=new");
    expect(JSON.stringify(loginRenderer!.toJSON())).not.toContain("Password updated");
  });
  it.each([
    ["login", "refused", "path"], ["login", "rejected", "query"],
    ["login", "setup-required", "hash"], ["setup", "refused", "path"], ["setup", "rejected", "query"]
  ])("drops late %s %s after actual %s change", async (stage, outcome, change) => {
    let finish!: (value: Response) => void; let fail!: (reason: Error) => void;
    const pending = new Promise<Response>((resolve, reject) => { finish = resolve; fail = reject; });
    const fetcher = vi.fn();
    if (stage === "setup") fetcher.mockResolvedValueOnce(response({ payload: { requiresCredentialSetup: true, user: { id: "user.setup" } } }));
    fetcher.mockReturnValueOnce(pending);
    const { location } = await mountLogin("/programs/docs?doc=old", fetcher);
    if (stage === "setup") { await submitLogin(); await enterReplacement(); }
    let request!: Promise<void>; await act(async () => { request = loginRenderer!.root.findByType("form").props.onSubmit({ preventDefault: vi.fn() }); });
    if (change === "path") location.pathname = "/get-started";
    else if (change === "hash") location.hash = "#new";
    else location.search = "?doc=new";
    location.href = `https://panel.invalid${location.pathname}${location.search}${location.hash}`;
    const next = location.href;
    await act(async () => {
      if (outcome === "rejected") fail(new Error("late connection failure"));
      else if (outcome === "setup-required") finish(response({ payload: { requiresCredentialSetup: true, user: { id: "user.setup" } } }));
      else finish(response({ ok: false, error: "Obsolete response" }, 401));
      await request;
    });
    expect(location.href).toBe(next);
    const rendered = JSON.stringify(loginRenderer!.toJSON());
    expect(rendered).not.toContain("Obsolete response"); expect(rendered).not.toContain("could not be reached");
    if (stage === "login") expect(rendered).not.toContain("Replace the temporary password");
  });
});
