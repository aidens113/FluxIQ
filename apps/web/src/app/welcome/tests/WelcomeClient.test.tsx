import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WelcomeClient } from "../WelcomeClient";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// A dummy token of the issued shape (43 base64url characters); never a real one.
const TOKEN = "T0k3nT0k3nT0k3nT0k3nT0k3nT0k3nT0k3nT0k3nT0k";

function stubWindow(hash: string) {
  const replaceState = vi.fn();
  const assign = vi.fn();
  vi.stubGlobal("window", { location: { hash, pathname: "/welcome", search: "", host: "app.example.test", assign }, history: { replaceState } });
  return { replaceState, assign };
}

/** Answers `/welcome/describe` and `/welcome/submit` with the given bodies and statuses. */
function stubFetch(answers: Record<string, { status: number; body: unknown }>) {
  const fetchMock = vi.fn(async (url: string) => {
    const answer = answers[url];
    if (!answer) throw new Error(`unexpected fetch ${url}`);
    return new Response(JSON.stringify(answer.body), { status: answer.status, headers: { "content-type": "application/json" } });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function render(): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(<WelcomeClient />); });
  await act(async () => { await Promise.resolve(); });
  return renderer;
}

const text = (renderer: ReactTestRenderer) => JSON.stringify(renderer.toJSON());

const INVITATION = { ok: true, invitation: { email: "person@example.test", role: "read-only", workspaceKind: "single" } };

afterEach(() => vi.unstubAllGlobals());

describe("WelcomeClient", () => {
  it("clears the fragment at once, says what the person joins and as what, and asks for a password and its confirmation", async () => {
    const { replaceState } = stubWindow(`#token=${TOKEN}`);
    const fetchMock = stubFetch({ "/welcome/describe": { status: 200, body: INVITATION } });
    const renderer = await render();
    expect(replaceState).toHaveBeenCalledWith(null, "", "/welcome");
    const shown = text(renderer);
    expect(shown).toContain("the FluxIQ workspace at app.example.test as a read-only member");
    expect(shown).toContain("person@example.test");
    expect(renderer.root.findAllByType("input")).toHaveLength(2);
    expect(shown).not.toContain(TOKEN);
    // The token is posted in the body, never in the URL.
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/welcome/describe");
  });

  it("shows the one invalid-link message when there is no token", async () => {
    stubWindow("");
    const renderer = await render();
    expect(text(renderer)).toContain("resend it from the site you signed up on");
    expect(renderer.root.findAllByType("input")).toHaveLength(0);
  });

  it("says a used or expired link is no good, with no password form and no token", async () => {
    stubWindow(`#token=${TOKEN}`);
    stubFetch({ "/welcome/describe": { status: 400, body: { ok: false, code: "invalid_link" } } });
    const renderer = await render();
    expect(text(renderer)).toContain("invalid, already used or expired");
    expect(text(renderer)).toContain("Ask whoever invited you to send a new invite");
    expect(renderer.root.findAllByType("input")).toHaveLength(0);
    expect(text(renderer)).not.toContain(TOKEN);
  });

  it("says a turned-off account is disabled", async () => {
    stubWindow(`#token=${TOKEN}`);
    stubFetch({ "/welcome/describe": { status: 403, body: { ok: false, code: "disabled" } } });
    const renderer = await render();
    expect(text(renderer)).toContain("This account is disabled");
    expect(renderer.root.findAllByType("input")).toHaveLength(0);
  });

  it("lands in the panel once the password is set, and drops the form if the link was spent meanwhile", async () => {
    const { assign } = stubWindow(`#token=${TOKEN}`);
    stubFetch({ "/welcome/describe": { status: 200, body: INVITATION }, "/welcome/submit": { status: 200, body: { ok: true, continueUrl: "/" } } });
    const renderer = await render();
    const [password, confirmation] = renderer.root.findAllByType("input");
    await act(async () => {
      password?.props.onChange({ target: { value: "a strong new password" } });
      confirmation?.props.onChange({ target: { value: "a strong new password" } });
    });
    await act(async () => { await renderer.root.findByType("form").props.onSubmit({ preventDefault: () => undefined }); });
    expect(assign).toHaveBeenCalledWith("/");

    stubFetch({ "/welcome/describe": { status: 200, body: INVITATION }, "/welcome/submit": { status: 400, body: { ok: false, code: "invalid_link" } } });
    const again = await render();
    const inputs = again.root.findAllByType("input");
    await act(async () => {
      inputs[0]?.props.onChange({ target: { value: "a strong new password" } });
      inputs[1]?.props.onChange({ target: { value: "a strong new password" } });
    });
    await act(async () => { await again.root.findByType("form").props.onSubmit({ preventDefault: () => undefined }); });
    expect(text(again)).toContain("invalid, already used or expired");
    expect(again.root.findAllByType("input")).toHaveLength(0);
  });
});
