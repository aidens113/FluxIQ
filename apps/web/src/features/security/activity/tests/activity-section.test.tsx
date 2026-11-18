import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Guarded } from "../../model";
import { activitySentence, ActivityList, ActivitySection, loadActivity, shapeActivityPage, type ActivityEntry, type ActivityPage } from "..";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const NOW = 1_000_000_000_000;
const entry = (at: number, who: string, outcome: ActivityEntry["outcome"] = "allowed"): ActivityEntry => ({ at, who, action: "iam:SetMemberRole", outcome, resources: ["Ben"] });

function text(renderer: ReactTestRenderer): string {
  return JSON.stringify(renderer.toJSON());
}

async function mount(load: (cursor: string | null) => Promise<Guarded<ActivityPage>>): Promise<ReactTestRenderer> {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(createElement(ActivitySection, { load, now: () => NOW }));
  });
  return renderer;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ActivitySection", () => {
  it("shows who, what, allowed or denied, to what and when, then loads older entries from the cursor", async () => {
    const asked: Array<string | null> = [];
    const load = vi.fn(async (cursor: string | null): Promise<Guarded<ActivityPage>> => {
      asked.push(cursor);
      return cursor === null
        ? { state: "ready", data: { entries: [entry(NOW - 5 * 60_000, "Ada"), entry(NOW - 2 * 3_600_000, "Cy", "denied")], next: "100.2" } }
        : { state: "ready", data: { entries: [entry(NOW - 3 * 86_400_000, "Dee")], next: null } };
    });
    const renderer = await mount(load);
    const first = text(renderer);
    for (const shown of ["Ada changed someone's role.", "Cy tried to change someone's role.", "Not allowed", "Ben", "5 min ago", "2 h ago", "Load more"]) expect([shown, first.includes(shown)]).toEqual([shown, true]);
    await act(async () => {
      renderer.root.findByProps({ className: "activity-more" }).props.onClick();
    });
    expect(asked).toEqual([null, "100.2"]);
    const after = text(renderer);
    expect(after).toContain("Dee");
    expect(after).toContain("Ada");
    expect(after).toContain("That is everything recorded.");
    expect(after).not.toContain("Load more");
  });

  it("says plainly when the person has no access", async () => {
    const renderer = await mount(async () => ({ state: "denied" }));
    expect(text(renderer)).toContain("You do not have access to this.");
    expect(text(renderer)).not.toContain("Load more");
  });

  it("says when nothing is recorded, and when it could not read", async () => {
    expect(text(await mount(async () => ({ state: "ready", data: { entries: [], next: null } })))).toContain("Nothing has been recorded yet.");
    expect(text(await mount(async () => {
      throw new Error("down");
    }))).toContain("Could not read the activity.");
  });

  it("keeps what it showed when an older page cannot be read", async () => {
    let calls = 0;
    const renderer = await mount(async () => {
      calls += 1;
      if (calls > 1) throw new Error("down");
      return { state: "ready", data: { entries: [entry(NOW, "Ada")], next: "5.1" } };
    });
    await act(async () => {
      renderer.root.findByProps({ className: "activity-more" }).props.onClick();
    });
    expect(text(renderer)).toContain("Ada");
    expect(text(renderer)).toContain("Could not read more activity.");
    expect(text(renderer)).toContain("Load more");
  });

  it("says how many items a list hid, and nothing of the kind for an entry without a count", () => {
    const list = (hidden?: number): ActivityEntry => ({ at: NOW - 60_000, who: "Bo", action: "studio:ListProjects", outcome: "denied", resources: ["This workspace"], ...(hidden === undefined ? {} : { hidden }) });
    const html = renderToStaticMarkup(createElement(ActivityList, { entries: [list(4), list(1), list()], now: NOW }));
    expect(html).toContain("This workspace · 4 items hidden · ");
    expect(html).toContain("This workspace · 1 item hidden · ");
    expect(html.match(/hidden/gu)).toHaveLength(2);
    expect(html).toContain("Bo was not allowed to list projects.");
  });

  it("draws an entry's values as text", () => {
    const html = renderToStaticMarkup(createElement(ActivityList, { entries: [{ ...entry(NOW, "<img src=x onerror=alert(1)>"), resources: ["<script>x</script>"] }], now: NOW }));
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<script>");
  });
});

describe("loadActivity", () => {
  function stub(status: number, body: unknown) {
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      calls.push(url);
      return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    }));
    return calls;
  }

  it("asks for the first page, then from the cursor", async () => {
    const calls = stub(200, { ok: true, payload: { entries: [], next: "7.3" } });
    expect(await loadActivity(null)).toEqual({ state: "ready", data: { entries: [], next: "7.3" } });
    await loadActivity("7.3");
    expect(calls).toEqual(["/api/security/audit", "/api/security/audit?cursor=7.3"]);
  });

  it("reads 401 and 403 as no access, and throws for anything else", async () => {
    stub(403, { ok: false, code: "forbidden", error: "Permission required: identity.manage" });
    expect(await loadActivity(null)).toEqual({ state: "denied" });
    stub(401, { ok: false });
    expect(await loadActivity(null)).toEqual({ state: "denied" });
    stub(500, { ok: false });
    await expect(loadActivity(null)).rejects.toThrow(/activity failed/u);
  });

  it("keeps only the fields it knows from an answer", async () => {
    stub(200, { ok: true, payload: { entries: [{ at: 1, who: "Ada", action: "iam:X", outcome: "allowed", resources: ["r", 7], requestId: "dummy-request", ipPrefix: "203.0.113.0/24" }, { at: "bad" }], next: "" } });
    expect(await loadActivity(null)).toEqual({ state: "ready", data: { entries: [{ at: 1, who: "Ada", action: "iam:X", outcome: "allowed", resources: ["r"] }], next: null } });
  });
});

describe("activity in plain words", () => {
  it("names a key by its readable name and never shows hex", () => {
    const hex = Array.from(new TextEncoder().encode("secret:Work")).map((byte) => byte.toString(16).padStart(2, "0")).join("");
    const html = renderToStaticMarkup(createElement(ActivityList, { entries: [{ at: NOW, who: "Ada", action: "secrets:DeleteKey", outcome: "allowed", result: "succeeded", resources: [`key ~${hex}`] }], now: NOW }));
    expect(html).toContain("Ada removed the key Work.");
    expect(html).not.toContain(hex);
  });

  it("says a key whose reference is only an id, without the id", () => {
    const html = renderToStaticMarkup(createElement(ActivityList, { entries: [{ at: NOW, who: "Ada", action: "secrets:DeleteKey", outcome: "allowed", result: "succeeded", resources: ["key ~7365637265743a3733363537323635373437"] }], now: NOW }));
    expect(html).toContain("Ada removed a key.");
    expect(html).not.toContain("7365");
  });

  it("says a key was added only when the save is known to have worked (journey 10)", () => {
    const line = (result?: "succeeded" | "failed") => activitySentence({ at: NOW, who: "Ada", action: "secrets:CreateKey", outcome: "allowed", ...(result ? { result } : {}), resources: [] });
    expect(line("succeeded")).toBe("Ada added a key.");
    expect(line("failed")).toBe("Ada tried to add a key, but it did not work.");
    // The permission check passing says nothing about the save: never "added" from the authorization alone.
    expect(line()).toBe("Ada tried to add a key.");
    expect(line()).not.toContain("added");
  });

  it("keeps the permission-only wording for acts that cannot fail after the check, and the denied wording", () => {
    expect(activitySentence({ at: NOW, who: "Ada", action: "iam:SetPassword", outcome: "allowed", resources: [] })).toBe("Ada changed a password.");
    expect(activitySentence({ at: NOW, who: "Cy", action: "secrets:CreateKey", outcome: "denied", resources: [] })).toBe("Cy tried to add a key.");
  });

  it("reads the operation's own result when the audit carries one, and ignores any other value", () => {
    const page = shapeActivityPage({ entries: [
      { at: 1, who: "Ada", action: "secrets:CreateKey", outcome: "allowed", result: "failed", resources: [] },
      { at: 2, who: "Ada", action: "secrets:CreateKey", outcome: "allowed", result: "other", resources: [] }
    ] });
    expect(page.entries.map((one) => one.result)).toEqual(["failed", undefined]);
  });

  it("keeps system activity behind Show system activity", async () => {
    const system: ActivityEntry = { at: NOW, who: "The platform administrator", action: "iam:AttachUserPolicy", outcome: "allowed", resources: ["service-identity website-backend"] };
    const lookup: ActivityEntry = { at: NOW, who: "Ada", action: "iam:Snapshot", outcome: "allowed", resources: [] };
    const renderer = await mount(async () => ({ state: "ready", data: { entries: [entry(NOW, "Ada"), system, lookup], next: null } }));
    expect(text(renderer)).not.toContain("platform administrator");
    expect(text(renderer)).not.toContain("snapshot");
    await act(async () => {
      renderer.root.findByProps({ type: "checkbox" }).props.onChange({ target: { checked: true } });
    });
    expect(text(renderer)).toContain("The platform administrator");
    expect(text(renderer)).toContain("Ada snapshot.");
  });
});
