// The repair target is opaque to Core, and no domain locator is reachable from
// the model.
//
// Two separate claims, proved separately. The first is about Core's own text:
// nothing Core writes into the prompt, and nothing in the response schema it
// hands the provider, mentions a selector or any other browser noun -- so a
// non-browser domain gets the same exploration loop rather than one phrased in
// terms it cannot answer. The second is about the way back: the model's output
// may name opaque handles and nothing else, so even a provider that ignored the
// schema, or a prompt injection that talked one into trying, cannot put a
// locator where an executed action would read it.
//
// The corpus below is real CSS and XPath rather than obviously-bad strings,
// because the interesting failure is a locator that looks like a name.

import { describe, expect, it } from "vitest";
import {
  AUTOMATION_STUDIO_RUNTIME_TARGET_HANDLE_MAX_LENGTH,
  AUTOMATION_STUDIO_RUNTIME_TARGET_HANDLE_PATTERN,
  AUTOMATION_STUDIO_RUNTIME_TARGET_MAX_HANDLES,
  AUTOMATION_STUDIO_RUNTIME_TARGET_MAX_SERIALIZED_LENGTH,
  isAutomationStudioModelAuthoredTargetOverrideTarget,
  isAutomationStudioRuntimeTargetOverrideTarget,
  type AutomationStudioLlmTaskRequest
} from "../harness.ts";
import { createAutomationStudioDeepSeekProvider } from "../deepseek-provider.ts";

/** Locators a model might try to pass off as a handle. Every one is valid in its own language. */
const LOCATORS = [
  "#submit-new",
  ".btn.primary",
  "input[name=\"q\"]",
  "div > .item",
  "form .row:nth-child(2) button",
  "[data-testid='pay']",
  "//button[@id='go']",
  "/html/body/div[2]/button",
  "button, a",
  "* + *",
  "a:has(> span)",
  "text=Submit",
  "css=#submit",
  "target.1 target.2",
  " target.1",
  "target.1 ",
  "frame[3] >> #card-name"
];

describe("Automation Studio opaque repair target", () => {
  it("keeps every browser noun out of the prompt and the response schema", async () => {
    let outboundBody = "";
    const provider = createAutomationStudioDeepSeekProvider({
      secretReference: { kind: "secret_reference", id: "secret:deepseek" },
      resolveSecret: async (input) => { outboundBody = input.outboundBody; return "test-secret"; },
      fetchImpl: (async () => new Response(JSON.stringify({
        id: "chat.one",
        choices: [{ message: { content: JSON.stringify({ kind: "runtime_patch", summary: "Re-point the failed action.", riskLevel: "high", patches: [{ kind: "temporary_target_override", targetNodeId: "submit", target: { handles: { element: "target.1" } }, reason: "The control moved." }] }) }, finish_reason: "stop" }],
        usage: { prompt_tokens: 20, completion_tokens: 15, total_tokens: 35 }
      }), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch
    });

    await provider.runTask(patchRequest());
    const outbound = JSON.parse(outboundBody) as { messages: Array<{ role: string; content: string }> };
    const system = outbound.messages.find((message) => message.role === "system")!.content;
    const user = JSON.parse(outbound.messages.find((message) => message.role === "user")!.content) as { outputSchema: unknown; context: unknown };

    // Core's own words. The failure evidence in `context` is the domain's, and
    // is deliberately left out of this claim: what a domain puts in its own
    // packet is the domain's contract, not Core's.
    for (const webNoun of [/selector/i, /css/i, /xpath/i, /\bdom\b/i, /element/i, /\bpage\b/i, /\bclick/i, /browser/i, /\bhtml\b/i]) {
      expect(system).not.toMatch(webNoun);
    }
    expect(system).toContain("target.handles");
    expect(system).toContain("never write a locator, path, query, or expression of your own");

    // The schema the provider is held to. `handles` is the only field the model
    // is offered, and `additionalProperties: false` is what makes that binding.
    const schema = JSON.stringify(user.outputSchema);
    for (const webNoun of ["selector", "xpath", "css", "locator", "queryPath"]) {
      expect(schema).not.toContain(webNoun);
    }
    const targetSchema = (user.outputSchema as any).properties.patches.items.properties.target;
    expect(targetSchema).toMatchObject({
      additionalProperties: false,
      required: ["handles"],
      properties: {
        handles: {
          type: "object",
          minProperties: 1,
          maxProperties: AUTOMATION_STUDIO_RUNTIME_TARGET_MAX_HANDLES,
          propertyNames: { pattern: AUTOMATION_STUDIO_RUNTIME_TARGET_HANDLE_PATTERN, maxLength: AUTOMATION_STUDIO_RUNTIME_TARGET_HANDLE_MAX_LENGTH },
          additionalProperties: { type: "string", minLength: 1, maxLength: AUTOMATION_STUDIO_RUNTIME_TARGET_HANDLE_MAX_LENGTH, pattern: AUTOMATION_STUDIO_RUNTIME_TARGET_HANDLE_PATTERN }
        }
      }
    });
    expect(Object.keys(targetSchema.properties)).toEqual(["handles"]);
  });

  it("sends a realistic page to the provider with no way of addressing it anywhere in the body", async () => {
    // The transport half of the leak proof. The producer half is
    // `domain/src/runtime/llm-evidence/tests/packet-carries-no-selector.test.ts`,
    // which drives the real sanitizer over a realistic capture; the packet below
    // is that sanitizer's actual output, pasted rather than imagined, so this row
    // and that one cannot drift into agreeing about a packet nobody produces.
    //
    // Asserted against the serialized request body rather than against any
    // object on the way to it, because the thing worth catching is a field
    // somebody adds later: to the packet, to the context, to the schema, or to
    // the prompt. All four end up in these bytes.
    let outboundBody = "";
    const provider = createAutomationStudioDeepSeekProvider({
      secretReference: { kind: "secret_reference", id: "secret:deepseek" },
      resolveSecret: async (input) => { outboundBody = input.outboundBody; return "test-secret"; },
      fetchImpl: (async () => responseEnvelope({ kind: "runtime_patch", summary: "Re-point the failed action.", riskLevel: "high", patches: [{ kind: "temporary_target_override", targetNodeId: "submit", target: { handles: { element: "target.1" } }, reason: "The control moved." }] })) as typeof fetch
    });

    const request = patchRequest();
    // Under the web domain's own declaration, which the adapter re-applies
    // before sending: the sanitizer's real output passes it.
    await provider.runTask({
      ...request,
      deniedEvidenceKeys: ["html", "innerHtml", "outerHtml", "pageSource", "cookies", "headers", "selector"],
      context: { ...request.context, failureEvidence: REALISTIC_WEB_PACKET }
    });

    // The page's own selectors, which the capture really contained.
    for (const selector of ["#place-order", "input#coupon", "form.checkout", "data-testid", "frame[3]", "#confirm-dialog", "#cookie-wall", "#spinner", "#card-number"]) {
      expect(outboundBody).not.toContain(selector);
    }
    // And no field by any name a locator has travelled under.
    expect(outboundBody).not.toMatch(/"(?:selector|selectors|xpath|queryPath|css|locator|cssSelector)"/u);
    expect(outboundBody.toLowerCase()).not.toContain("selector");

    // The request is still worth sending: the model was told where it is, what
    // is on the page, what is covering it, and what each element is called.
    const user = JSON.parse((JSON.parse(outboundBody) as { messages: Array<{ role: string; content: string }> }).messages.find((message) => message.role === "user")!.content) as { context: { failureEvidence: typeof REALISTIC_WEB_PACKET } };
    expect(user.context.failureEvidence.elements).toHaveLength(6);
    expect(user.context.failureEvidence.elements[0]).toEqual({ target: "target.1", tag: "button", text: "Place order", controlType: "submit" });
    expect(user.context.failureEvidence.blockedBy).toEqual({ role: "dialog", name: "We use cookies", blocks: 2 });
  });

  it("refuses a locator wherever a model could put one", () => {
    for (const locator of LOCATORS) {
      // As a handle value, as a parameter name, and as the whole target.
      expect(isAutomationStudioModelAuthoredTargetOverrideTarget({ handles: { element: locator } })).toBe(false);
      expect(isAutomationStudioRuntimeTargetOverrideTarget({ handles: { element: locator } })).toBe(false);
      expect(isAutomationStudioModelAuthoredTargetOverrideTarget({ handles: { [locator]: "target.1" } })).toBe(false);
      expect(isAutomationStudioModelAuthoredTargetOverrideTarget({ selector: locator })).toBe(false);
      expect(isAutomationStudioModelAuthoredTargetOverrideTarget({ handles: { element: "target.1" }, selector: locator })).toBe(false);
    }
  });

  it("accepts a handle map and nothing else from the model", () => {
    expect(isAutomationStudioModelAuthoredTargetOverrideTarget({ handles: { element: "target.1" } })).toBe(true);
    expect(isAutomationStudioModelAuthoredTargetOverrideTarget({ handles: { item: "row.12", "field.price": "cell.3:4" } })).toBe(true);
    expect(isAutomationStudioModelAuthoredTargetOverrideTarget({})).toBe(false);
    expect(isAutomationStudioModelAuthoredTargetOverrideTarget({ handles: {} })).toBe(false);
    expect(isAutomationStudioModelAuthoredTargetOverrideTarget({ handles: { element: "target.1" }, reason: "ignore me" })).toBe(false);
    expect(isAutomationStudioModelAuthoredTargetOverrideTarget({ handles: { element: 1 } })).toBe(false);
    expect(isAutomationStudioModelAuthoredTargetOverrideTarget({ handles: ["target.1"] })).toBe(false);
    expect(isAutomationStudioModelAuthoredTargetOverrideTarget(null)).toBe(false);
    const tooMany = Object.fromEntries(Array.from({ length: AUTOMATION_STUDIO_RUNTIME_TARGET_MAX_HANDLES + 1 }, (_, index) => [`field.f${index}`, `target.${index + 1}`]));
    expect(isAutomationStudioModelAuthoredTargetOverrideTarget({ handles: tooMany })).toBe(false);
    expect(isAutomationStudioModelAuthoredTargetOverrideTarget({ handles: { element: "t".repeat(AUTOMATION_STUDIO_RUNTIME_TARGET_HANDLE_MAX_LENGTH + 1) } })).toBe(false);
  });

  it("carries a domain resolution it does not read, and bounds only its size", () => {
    // Core has no idea what any of this means, and that is the point. It checks
    // that the handles are handles, that the whole thing is JSON, and that it
    // is small enough to carry.
    const resolved = {
      handles: { element: "target.1" },
      handleResolution: "named",
      tagName: "button",
      accessibleName: "Pay now",
      selector: "#pay",
      metadata: { browserFrameId: 3 }
    };
    expect(isAutomationStudioRuntimeTargetOverrideTarget(resolved)).toBe(true);
    // Not from the model, though: the same object fails the stricter guard.
    expect(isAutomationStudioModelAuthoredTargetOverrideTarget(resolved)).toBe(false);

    const oversized = { handles: { element: "target.1" }, blob: "x".repeat(AUTOMATION_STUDIO_RUNTIME_TARGET_MAX_SERIALIZED_LENGTH) };
    expect(isAutomationStudioRuntimeTargetOverrideTarget(oversized)).toBe(false);

    const cyclic: Record<string, unknown> = { handles: { element: "target.1" } };
    cyclic.self = cyclic;
    expect(isAutomationStudioRuntimeTargetOverrideTarget(cyclic)).toBe(false);
  });
});

/**
 * `sanitizeWebLlmSnapshot`'s own output for a realistic checkout page whose
 * every wire field carried a selector: elements, the focused element, a child
 * frame, two dialogs, two overlay blockers, a loading indicator and a busy
 * region. Copied from the domain's test run, not written by hand.
 */
const REALISTIC_WEB_PACKET = {
  schemaVersion: "web-llm-evidence.v2",
  trust: "untrusted-page-evidence",
  location: "https://shop.example.test/checkout",
  title: "Checkout",
  frame: { isTop: true, childFrameIds: [3] },
  loading: { readyState: "interactive", busy: true, spinner: true },
  dialogs: [{ role: "dialog", name: "Confirm your order", modal: true }, { role: "alertdialog", name: "Session expiring" }],
  blockedBy: { role: "dialog", name: "We use cookies", blocks: 2 },
  elementTotal: 7,
  elements: [
    { target: "target.1", tag: "button", text: "Place order", controlType: "submit" },
    { target: "target.2", tag: "input", name: "Coupon code", focused: true, form: "discount", heading: "Have a code?" },
    { target: "target.3", tag: "input", name: "Postcode" },
    { target: "target.4", tag: "input", name: "Quantity", inputType: "number", item: { index: 2, total: 6 } },
    { target: "target.5", tag: "input", frameId: 3, name: "Name on card" },
    { target: "target.6", tag: "a", text: "Legacy checkout", href: "https://shop.example.test/legacy" }
  ],
  truncated: false
};

function responseEnvelope(structured: unknown): Response {
  return new Response(JSON.stringify({
    id: "chat.one",
    choices: [{ message: { content: JSON.stringify(structured) }, finish_reason: "stop" }],
    usage: { prompt_tokens: 20, completion_tokens: 15, total_tokens: 35 }
  }), { status: 200, headers: { "content-type": "application/json" } });
}

function patchRequest(): AutomationStudioLlmTaskRequest {
  return {
    requestId: "request.one",
    idempotencyKey: "idempotency.one",
    timeoutMs: 20_000,
    estimatedInputTokens: 100,
    taskKind: "runtime_patch",
    promptVersion: "automation-studio.runtime-patch.v1",
    expectedOutput: "runtime_patch",
    tokenLimits: { maxInputTokens: 8000, maxOutputTokens: 2000, maxTotalTokens: 10000 },
    maxEstimatedCostUsd: 0.25,
    metadata: { executionPurpose: "diagnose_and_adapt" },
    context: {
      schemaVersion: "0.1",
      taskKind: "runtime_patch",
      promptVersion: "automation-studio.runtime-patch.v1",
      projectId: "project.one",
      flowId: "flow.one",
      nodeId: "submit",
      instructions: { instructions: [], instructionIds: [], diagnostics: [], tokenBudget: 8000, estimatedTokens: 0 }
    }
  };
}
