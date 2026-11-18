import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SignupClient } from "../SignupClient";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function stubFetch(status: number, body: unknown) {
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function render(): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(<SignupClient termsVersion="2026-11-18" />); });
  return renderer;
}

async function fillAndSubmit(renderer: ReactTestRenderer, accept = true) {
  const [email, name, terms] = renderer.root.findAllByType("input");
  await act(async () => {
    email?.props.onChange({ target: { value: " person@example.test " } });
    name?.props.onChange({ target: { value: " A Person " } });
    if (accept) terms?.props.onChange({ target: { checked: true } });
  });
  await act(async () => { await renderer.root.findByType("form").props.onSubmit({ preventDefault: () => undefined }); });
}

const text = (renderer: ReactTestRenderer) => JSON.stringify(renderer.toJSON());

afterEach(() => vi.unstubAllGlobals());

describe("SignupClient", () => {
  it("posts the trimmed email and name with the terms version shown, then says to check the email", async () => {
    const fetchMock = stubFetch(200, { ok: true });
    const renderer = await render();
    expect(text(renderer)).toContain("2026-11-18");
    await fillAndSubmit(renderer);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/signup/submit");
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ email: "person@example.test", displayName: "A Person", termsVersion: "2026-11-18" });
    expect(text(renderer)).toContain("Check your email");
    expect(renderer.root.findAllByType("input")).toHaveLength(0);
  });

  it("posts nothing until the terms are accepted", async () => {
    const fetchMock = stubFetch(200, { ok: true });
    const renderer = await render();
    await fillAndSubmit(renderer, false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(renderer.root.findByType("button").props.disabled).toBe(true);
  });

  it("explains a refusal and keeps the form", async () => {
    stubFetch(429, { ok: false, code: "rate_limited" });
    const renderer = await render();
    await fillAndSubmit(renderer);
    expect(text(renderer)).toContain("Too many sign-ups");
    expect(renderer.root.findAllByType("input")).toHaveLength(3);
  });
});
