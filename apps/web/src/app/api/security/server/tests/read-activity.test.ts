import type { IamAuditRecord } from "fluxiq/platform";
import { describe, expect, it } from "vitest";
import type { ActivityPage } from "../../../../../features/security/activity/model";
import { readActivity } from "../read-activity";
import { auditHarness, memoryAudit, OTHER_WORKSPACE, record, userFrn, WORKSPACE } from "./audit-harness";

const payload = (answer: { body: unknown }) => (answer.body as { payload: ActivityPage }).payload;

describe("readActivity: who may read", () => {
  it("refuses a person without identity.manage, decides and audits it, and never opens the audit", async () => {
    const audit = memoryAudit([record({ time: 10, principal: userFrn(WORKSPACE, "user-admin") })]);
    const harness = auditHarness({ who: "viewer", audit });
    const answer = await readActivity(harness.deps, null);
    expect(answer).toEqual({ status: 403, body: { ok: false, code: "forbidden", error: "Permission required: identity.manage" } });
    expect(harness.opened()).toBe(0);
    expect(audit.reads).toEqual([]);
    expect(harness.decisions.records.map((row) => [row.action, row.decision])).toEqual([["iam:ListAuditEvents", "deny"]]);
  });

  it("allows an administrator, and audits the read as an allow on the workspace", async () => {
    const harness = auditHarness({ audit: memoryAudit([]) });
    expect(await readActivity(harness.deps, null)).toEqual({ status: 200, body: { ok: true, payload: { entries: [], next: null } } });
    expect(harness.decisions.records.map((row) => [row.action, row.decision, row.resources])).toEqual([["iam:ListAuditEvents", "allow", [`frn:fluxiq:platform::workspace/${WORKSPACE}`]]]);
  });

  it("on service, allows an owner's and an administrator's policy and refuses a member's and a read-only person's", async () => {
    for (const [policy, status] of [["owner", 200], ["administrator", 200], ["member", 403], ["read-only", 403]] as const) {
      const harness = auditHarness({ policy, audit: memoryAudit([]) });
      const answer = await readActivity(harness.deps, null);
      expect([policy, answer.status]).toEqual([policy, status]);
      if (status === 403) expect([policy, answer.body, harness.opened()]).toEqual([policy, { ok: false, code: "forbidden", error: "Not authorized: iam:ListAuditEvents" }, 0]);
    }
  });

  it("refuses a cursor it did not write, after deciding who asks", async () => {
    const admin = auditHarness({ audit: memoryAudit([]) });
    for (const cursor of ["", "abc", "10", "10.0", "-1.1", "1.1.1", "9999999999999.1"]) expect([cursor, (await readActivity(admin.deps, cursor)).status]).toEqual([cursor, 400]);
    const viewer = auditHarness({ who: "viewer", audit: memoryAudit([]) });
    expect((await readActivity(viewer.deps, "abc")).status).toBe(403);
  });
});

describe("readActivity: one workspace's entries only", () => {
  const mine = userFrn(WORKSPACE, "ana");
  const theirs = userFrn(OTHER_WORKSPACE, "bo");
  const records = [
    record({ time: 1, principal: mine, action: "iam:SetMemberRole", resources: [userFrn(WORKSPACE, "cy")] }),
    record({ time: 2, principal: theirs, action: "iam:SetMemberRole", resources: [userFrn(OTHER_WORKSPACE, "di")] }),
    record({ time: 3, principal: theirs, action: "studio:ListProjects", resources: [] }),
    // Someone here reaching for another workspace's project: it names that workspace, so it is not shown here.
    record({ time: 4, principal: mine, action: "studio:ReadProject", resources: [`frn:fluxiq:studio:${OTHER_WORKSPACE}:project/p9`], decision: "deny", category: "deny" }),
    // The platform acting on an account names no workspace.
    record({ time: 5, principal: "frn:fluxiq:iam::service-identity/website", action: "platform:CreateAccount", resources: ["frn:fluxiq:platform::account/acc-1"] }),
    record({ time: 6, principal: "in-process", action: "platform:DeleteAccount", resources: [`frn:fluxiq:platform::workspace/${OTHER_WORKSPACE}`] }),
    record({ time: 7, principal: "in-process", action: "platform:AddMember", resources: [`frn:fluxiq:platform::workspace/${WORKSPACE}`] }),
    record({ time: 8, principal: "not an frn", action: "studio:ListProjects", resources: [] }),
    record({ time: 9, principal: mine, action: "studio:ListProjects", resources: ["frn:something-else"] }),
    record({ time: 10, principal: `frn:fluxiq:iam:${WORKSPACE}x:user/ana`, action: "studio:ListProjects", resources: [] })
  ];

  it("shows only records by this workspace's people, or by the platform naming this workspace, under several workspaces", async () => {
    const harness = auditHarness({ audit: memoryAudit(records), names: { ana: "Ana", cy: "Cy" } });
    const page = payload(await readActivity(harness.deps, null));
    expect(page.entries).toEqual([
      { at: 7000, who: "FluxIQ", action: "platform:AddMember", outcome: "allowed", resources: ["This workspace"] },
      { at: 1000, who: "Ana", action: "iam:SetMemberRole", outcome: "allowed", resources: ["Cy"] }
    ]);
    expect(JSON.stringify(page)).not.toMatch(/ws-b|"bo"|di|p9|website|acc-1/u);
  });

  it("under one workspace, also shows the platform's own records that name no workspace, never one naming another", async () => {
    const harness = auditHarness({ audit: memoryAudit(records), tenancy: "single", names: { ana: "Ana" } });
    const page = payload(await readActivity(harness.deps, null));
    expect(page.entries.map((entry) => entry.at / 1000)).toEqual([7, 5, 1]);
    expect(page.entries[1]).toEqual({ at: 5000, who: "Service website", action: "platform:CreateAccount", outcome: "allowed", resources: ["account acc-1"] });
  });

  it("never names a person who is not in this workspace", async () => {
    const harness = auditHarness({ audit: memoryAudit([record({ time: 1, principal: userFrn(WORKSPACE, "gone"), resources: ["frn:fluxiq:platform::account/stranger"] })]) });
    expect(payload(await readActivity(harness.deps, null)).entries).toEqual([
      { at: 1000, who: "Someone no longer in this workspace", action: "studio:ListProjects", outcome: "allowed", resources: ["account stranger"] }
    ]);
  });
});

describe("readActivity: the fields an entry carries", () => {
  it("keeps when, who, action, outcome and resources, and nothing else of the record", async () => {
    const full: IamAuditRecord = {
      ...record({ time: 42, principal: userFrn(WORKSPACE, "ana") }),
      category: "deny",
      decision: "deny",
      action: "secrets:RevealKey",
      resources: [`frn:fluxiq:secrets:${WORKSPACE}:key/k1`],
      requestId: "request-id-dummy-7f3a",
      matched: { policy: "DummyPolicyName", sid: "DummyStatementSid" },
      origin: "extension-chat",
      ipPrefix: "203.0.113.0/24",
      via: "assistant",
      consent: "press"
    };
    const harness = auditHarness({ audit: memoryAudit([full]), names: { ana: "Ana" } });
    const page = payload(await readActivity(harness.deps, null));
    expect(page.entries).toHaveLength(1);
    expect(Object.keys(page.entries[0]!).sort()).toEqual(["action", "at", "outcome", "resources", "who"]);
    expect(page.entries[0]).toEqual({ at: 42_000, who: "Ana", action: "secrets:RevealKey", outcome: "denied", resources: ["key k1"] });
    const text = JSON.stringify(page);
    for (const hidden of ["request-id-dummy-7f3a", "DummyPolicyName", "DummyStatementSid", "extension-chat", "203.0.113", "assistant", "press", "frn:fluxiq"]) expect([hidden, text.includes(hidden)]).toEqual([hidden, false]);
  });
});

describe("readActivity: a list that hid items", () => {
  it("carries how many items the list hid, and nothing for a row without a count, an old row included", async () => {
    const ana = userFrn(WORKSPACE, "ana");
    const scope = `frn:fluxiq:platform::workspace/${WORKSPACE}`;
    const harness = auditHarness({
      audit: memoryAudit([
        // Written before the count existed: a row per hidden item.
        record({ time: 1, principal: ana, category: "deny", decision: "deny", action: "studio:Projects", resources: [`frn:fluxiq:studio:${WORKSPACE}:project/p1`] }),
        record({ time: 2, principal: ana, category: "deny", decision: "deny", action: "studio:Projects", resources: [scope], hidden: 12 }),
        record({ time: 3, principal: ana, category: "deny", decision: "deny", action: "studio:Projects", resources: [scope], hidden: 0 }),
        record({ time: 4, principal: ana, category: "deny", decision: "deny", action: "studio:Projects", resources: [scope], hidden: 1.5 })
      ]),
      names: { ana: "Ana" }
    });
    const page = payload(await readActivity(harness.deps, null));
    expect(page.entries.map((entry) => [entry.at, entry.resources, entry.hidden])).toEqual([
      [4000, ["This workspace"], undefined],
      [3000, ["This workspace"], undefined],
      [2000, ["This workspace"], 12],
      [1000, ["project p1"], undefined]
    ]);
    expect(page.entries.filter((entry) => "hidden" in entry)).toHaveLength(1);
    expect(Object.keys(page.entries[2]!).sort()).toEqual(["action", "at", "hidden", "outcome", "resources", "who"]);
  });
});

describe("readActivity: pages", () => {
  it("pages newest first through records sharing a second, each exactly once", async () => {
    const records: IamAuditRecord[] = [];
    for (let index = 0; index < 130; index += 1) {
      // Many records share a second, and other workspaces' records lie between this one's.
      records.push(record({ time: 100 + Math.floor(index / 40), principal: userFrn(WORKSPACE, "ana"), action: `studio:Step${index}` }));
      if (index % 3 === 0) records.push(record({ time: 100 + Math.floor(index / 40), principal: userFrn(OTHER_WORKSPACE, "bo") }));
    }
    const harness = auditHarness({ audit: memoryAudit(records) });
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const page: ActivityPage = payload(await readActivity(harness.deps, cursor));
      seen.push(...page.entries.map((entry) => entry.action));
      cursor = page.next;
      pages += 1;
    } while (cursor !== null && pages < 10);
    expect(seen).toEqual(Array.from({ length: 130 }, (_, index) => `studio:Step${129 - index}`));
    expect(pages).toBe(3);
  });

  it("pages through a second holding more records than one read asks for", async () => {
    const records: IamAuditRecord[] = [];
    for (let index = 0; index < 450; index += 1) records.push(record({ time: 50, principal: index % 5 === 0 ? userFrn(WORKSPACE, "ana") : userFrn(OTHER_WORKSPACE, "bo"), action: `studio:Busy${index}` }));
    records.push(record({ time: 49, principal: userFrn(WORKSPACE, "ana"), action: "studio:Before" }));
    const harness = auditHarness({ audit: memoryAudit(records) });
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const page: ActivityPage = payload(await readActivity(harness.deps, cursor));
      seen.push(...page.entries.map((entry) => entry.action));
      cursor = page.next;
      pages += 1;
    } while (cursor !== null && pages < 10);
    const busy = Array.from({ length: 90 }, (_, index) => `studio:Busy${445 - index * 5}`);
    expect(seen).toEqual([...busy, "studio:Before"]);
  });

  it("reads only the rest of the cursor's second, however large its count, before older seconds", async () => {
    const audit = memoryAudit([record({ time: 7, principal: userFrn(WORKSPACE, "ana"), action: "studio:Older" })]);
    const harness = auditHarness({ audit });
    const page = payload(await readActivity(harness.deps, "8.999999999"));
    expect(page).toEqual({ entries: [{ at: 7000, who: "Someone no longer in this workspace", action: "studio:Older", outcome: "allowed", resources: [] }], next: null });
    expect(audit.reads[0]).toEqual({ since: 8, until: 9, limit: 999_999_999 + 200 });
    expect(audit.reads[1]).toEqual({ until: 8, limit: 200 });
  });

  it("answers what it found after looking through many other workspaces' records, and carries on from there", async () => {
    const records = [record({ time: 1, principal: userFrn(WORKSPACE, "ana"), action: "studio:Oldest" })];
    for (let index = 0; index < 2500; index += 1) records.push(record({ time: 2 + Math.floor(index / 300), principal: userFrn(OTHER_WORKSPACE, "bo") }));
    const harness = auditHarness({ audit: memoryAudit(records) });
    const first = payload(await readActivity(harness.deps, null));
    expect(first.entries).toEqual([]);
    expect(first.next).not.toBeNull();
    const second = payload(await readActivity(harness.deps, first.next));
    expect([second.entries.map((entry) => entry.action), second.next]).toEqual([["studio:Oldest"], null]);
  });
});
