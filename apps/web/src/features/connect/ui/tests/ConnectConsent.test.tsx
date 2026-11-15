import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ConnectConsent } from "..";
import { AUTHORIZE_REQUEST, TOKEN_RESPONSE } from "../../server/tests/fixture";

describe("connect consent form", () => {
  it("shows the actual browser/person/workspace, posts explicitly and renders no credential", () => {
    const html = renderToStaticMarkup(<ConnectConsent view={{ kind: "consent", request: AUTHORIZE_REQUEST, evidence: "a".repeat(64), user: TOKEN_RESPONSE.user, workspace: TOKEN_RESPONSE.workspace }} />);
    expect(html).toContain("Synthetic browser");
    expect(html).toContain("Synthetic User");
    expect(html).toContain("Synthetic workspace");
    expect(html).toContain('method="post"');
    expect(html).toContain('action="/api/connect/authorize"');
    expect(html).toContain('name="decision"');
    expect(html).toContain('value="approve"');
    expect(html).toContain('value="deny"');
    expect(html).not.toContain(TOKEN_RESPONSE.credential);
    expect(html).not.toContain('name="userId"');
    expect(html).not.toContain('name="workspaceId"');
  });
});
